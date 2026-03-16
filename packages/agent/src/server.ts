import express, { type Express } from 'express';
import { createServer as createNetServer } from 'node:net';
import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import rateLimit from 'express-rate-limit';
import {
  generateBootstrapToken,
  verifyBootstrapToken,
  createSessionJWT,
  hashToken,
} from './auth.js';
import type { DbStatements } from './db.js';
import type { AgentConfig } from './config.js';

export interface ServerContext {
  app: Express;
  httpServer: HttpServer;
  wss: WebSocketServer;
}

/**
 * Set of allowed origins for CORS and WebSocket origin checks.
 * Populated at startup and updated when tunnel URLs change.
 */
const allowedOrigins = new Set<string>();

/**
 * Returns the first non-internal IPv4 address (e.g. 192.168.x.x).
 */
function getLocalIP(): string | null {
  const nets = networkInterfaces();
  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue;
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

/**
 * Updates the set of allowed origins based on the current server port and tunnel URL.
 * Called at startup and whenever the tunnel is recreated.
 */
export function updateAllowedOrigins(port: number, tunnelUrl?: string, webPort?: number): void {
  allowedOrigins.clear();

  // All ports that serve the app (agent + vite dev server if different)
  const ports = new Set([port]);
  if (webPort && webPort !== port) ports.add(webPort);

  // Hosts: localhost, loopback, and local network IP (phones on same Wi-Fi)
  const hosts = ['localhost', '127.0.0.1'];
  const localIP = getLocalIP();
  if (localIP) hosts.push(localIP);

  for (const host of hosts) {
    for (const p of ports) {
      allowedOrigins.add(`http://${host}:${p}`);
    }
  }

  if (tunnelUrl) {
    try {
      const url = new URL(tunnelUrl);
      allowedOrigins.add(url.origin);
    } catch { /* invalid URL — skip */ }
  }
}

/**
 * Finds the @clsh/web dist directory by probing multiple candidate paths.
 * Works both in the monorepo (sibling package) and when installed via npm.
 */
function findWebDist(): string | null {
  const candidates = [
    // Monorepo: packages/agent/dist/ -> packages/web/dist/
    join(import.meta.dirname, '..', '..', 'web', 'dist'),
  ];

  // npm install: resolve @clsh/web package and find its dist/
  try {
    const require = createRequire(import.meta.url);
    const webPkg = require.resolve('@clsh/web/package.json');
    candidates.push(join(dirname(webPkg), 'dist'));
  } catch {
    // @clsh/web not resolvable as a dependency — that's fine in monorepo
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Creates and configures the Express app, HTTP server, and WebSocketServer.
 * Mounts auth routes, SSE routes, health check, and static file serving.
 */
export function createAppServer(
  config: AgentConfig,
  statements: DbStatements,
): ServerContext {
  const app = express();

  // Trust the first proxy (ngrok/SSH tunnel) so express-rate-limit
  // reads the real client IP from X-Forwarded-For
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.header('X-Frame-Options', 'DENY');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:");
    next();
  });

  // Middleware — dynamic CORS (restricted to allowed origins)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth routes (rate-limited)
  mountAuthRoutes(app, config, statements);

  // Static file serving (web dist)
  const webDistPath = findWebDist();
  if (webDistPath) {
    app.use(express.static(webDistPath));
    // SPA fallback: serve index.html for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      const indexPath = join(webDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server with native ping to detect dead connections.
  // Clients that don't respond to a ping within 30s are terminated.
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 64 * 1024, // 64 KB max message size (H3)
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      const origin = info.origin;
      // Allow connections with no origin header (non-browser clients, CLIs)
      if (!origin) return true;
      if (allowedOrigins.has(origin)) return true;
      console.warn(`  WS rejected: origin "${origin}" not in [${[...allowedOrigins].join(', ')}]`);
      return false;
    },
  });

  const WS_PING_INTERVAL = 30_000;
  const pingInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if ((ws as unknown as { isAlive?: boolean }).isAlive === false) {
        ws.terminate();
        continue;
      }
      (ws as unknown as { isAlive: boolean }).isAlive = false;
      ws.ping();
    }
  }, WS_PING_INTERVAL);

  wss.on('close', () => clearInterval(pingInterval));

  return { app, httpServer, wss };
}

function mountAuthRoutes(
  app: Express,
  config: AgentConfig,
  statements: DbStatements,
): void {
  // Rate limit auth endpoint (H2): 10 requests per 15 minutes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });

  // POST /api/auth/bootstrap — exchange a bootstrap token for a JWT
  app.post('/api/auth/bootstrap', authLimiter, async (req, res) => {
    try {
      const { token } = req.body as { token?: string };

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Missing or invalid token' });
        return;
      }

      const valid = verifyBootstrapToken(statements, token);
      if (!valid) {
        res.status(401).json({ error: 'Invalid or expired bootstrap token' });
        return;
      }

      // Consume the token immediately — one-time use only
      statements.deleteBootstrapToken.run(hashToken(token));

      const jwt = await createSessionJWT(
        { authMethod: 'bootstrap' },
        config.jwtSecret,
      );

      res.json({ token: jwt });
    } catch (err) {
      console.error('Bootstrap auth error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

}

/**
 * Checks if a port is available by briefly binding a TCP server to it.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createNetServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * Finds the first free port starting from `port`, trying up to 10 consecutive ports.
 */
async function findFreePort(port: number): Promise<number> {
  for (let p = port; p < port + 10; p++) {
    if (await isPortFree(p)) return p;
    console.log(`  Port ${String(p)} in use, trying ${String(p + 1)}...`);
  }
  throw new Error(`No free port found in range ${String(port)}-${String(port + 9)}`);
}

/**
 * Starts the HTTP server on the configured port.
 * If the port is busy, tries up to 10 consecutive ports.
 * Returns the actual port the server is listening on.
 */
export async function startServer(
  httpServer: HttpServer,
  port: number,
): Promise<number> {
  const freePort = await findFreePort(port);
  return new Promise((resolve) => {
    httpServer.listen(freePort, () => {
      resolve(freePort);
    });
  });
}

export { generateBootstrapToken };
