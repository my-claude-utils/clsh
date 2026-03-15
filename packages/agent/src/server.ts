import express, { type Express } from 'express';
import { createServer as createNetServer } from 'node:net';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  generateBootstrapToken,
  verifyBootstrapToken,
  createSessionJWT,
} from './auth.js';
import { createSSERouter } from './sse-handler.js';
import type { DbStatements } from './db.js';
import type { AgentConfig } from './config.js';

export interface ServerContext {
  app: Express;
  httpServer: HttpServer;
  wss: WebSocketServer;
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

  // Middleware — CORS for development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth routes
  mountAuthRoutes(app, config, statements);

  // SSE routes
  const sseRouter = createSSERouter();
  app.use('/api/sse', sseRouter);

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
  const wss = new WebSocketServer({ server: httpServer });

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
  // POST /api/auth/bootstrap — exchange a bootstrap token for a JWT
  app.post('/api/auth/bootstrap', async (req, res) => {
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
