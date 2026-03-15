// @clsh/agent -- entry point
// Starts the local server, PTY sessions, tunnel, and prints QR code

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { loadConfig } from './config.js';
import { initDatabase } from './db.js';
import { generateBootstrapToken, hashToken } from './auth.js';
import { createAppServer, startServer } from './server.js';
import { setupWebSocketHandler } from './ws-handler.js';
import { PTYManager } from './pty-manager.js';
import { createTunnel, printAccessInfo, startTunnelMonitor, registerShutdownHandlers } from './tunnel.js';
import { isTmuxAvailable, ensureTmuxConfig } from './tmux.js';
import { checkNetworkPersistence } from './power.js';

/**
 * Prevents macOS from sleeping while the agent is running.
 * Flags: -d (display), -i (idle), -s (system/lid-close on AC power).
 * The caffeinate process is killed automatically when the agent exits (-w).
 */
function preventSleep(): (() => void) | null {
  if (process.platform !== 'darwin') return null;
  try {
    const child = spawn('caffeinate', ['-dis', '-w', String(process.pid)], {
      stdio: 'ignore',
      detached: false,
    });
    child.unref();
    console.log('  Sleep prevention active (caffeinate)');
    return () => child.kill();
  } catch {
    console.log('  Warning: could not start caffeinate — machine may sleep');
    return null;
  }
}

export async function main(): Promise<void> {
  // 0a. Check if macOS is configured for lid-close networking
  checkNetworkPersistence();

  // 0b. Prevent macOS from sleeping while the agent is running
  const stopCaffeinate = preventSleep();

  // 1. Load configuration
  const config = loadConfig();

  // 2. Initialize database
  const { db, statements } = initDatabase(config.dbPath);

  // 3. Generate bootstrap token and store its hash
  const bootstrapToken = generateBootstrapToken();
  const tokenId = randomUUID();
  const tokenHash = hashToken(bootstrapToken);
  statements.insertBootstrapToken.run(tokenId, tokenHash);

  // 4. tmux session persistence (control mode -CC for scrollback support)
  //    Falls back to raw PTY if tmux is not installed or CLSH_NO_TMUX=1
  let tmuxEnabled = false;
  let tmuxConfPath: string | null = null;

  if (config.tmuxDisabled) {
    console.log('  Session persistence disabled (CLSH_NO_TMUX=1)');
  } else if (!isTmuxAvailable()) {
    console.log('  Sessions are ephemeral (tmux not found — install tmux for session persistence)');
  } else {
    tmuxConfPath = ensureTmuxConfig();
    tmuxEnabled = true;
    console.log('  Session persistence active (tmux control mode)');
  }

  // 5. Create HTTP + WebSocket server
  const { httpServer, wss } = createAppServer(config, statements);

  // 6. Set up PTY manager and WebSocket handler
  const ptyManager = new PTYManager({
    tmuxEnabled,
    tmuxConfPath,
    dbStatements: statements,
  });

  // 7. Recover sessions from previous server run (tmux sessions survive restarts)
  if (tmuxEnabled) {
    const recovered = ptyManager.rediscoverAll();
    if (recovered.length > 0) {
      console.log(`  Recovered ${String(recovered.length)} session(s) from previous run`);
    }
  }

  setupWebSocketHandler(wss, ptyManager, config.jwtSecret);

  // 8. Start HTTP server (auto-finds open port if configured port is busy)
  const actualPort = await startServer(httpServer, config.port);
  if (actualPort !== config.port) {
    console.log(`  Agent running on port ${String(actualPort)} (${String(config.port)} was busy)`);
  }

  // 9. Create tunnel — tries ngrok → SSH (localhost.run) → local network IP
  // If WEB_PORT was explicitly set (dev mode), tunnel to that; otherwise tunnel to the actual agent port
  const tunnelPort = config.webPort !== config.port ? config.webPort : actualPort;
  const tunnel = await createTunnel(tunnelPort, config.ngrokAuthtoken, config.ngrokStaticDomain, config.tunnelMethod);

  // 10. Print clean startup info
  printAccessInfo(tunnel.url, bootstrapToken, tunnel.method);

  // 11. Monitor tunnel health — auto-recovers after sleep/wake or SSH death
  const stopTunnelMonitor = startTunnelMonitor((newUrl, method) => {
    // Tunnel was recreated with a (possibly new) URL — reprint access info
    printAccessInfo(newUrl, bootstrapToken, method);
  });

  // 12. Register graceful shutdown handlers
  registerShutdownHandlers(() => {
    stopCaffeinate?.();
    stopTunnelMonitor();
    ptyManager.destroyAll(); // Kills control clients but leaves tmux sessions alive
    db.close();
    httpServer.close();
  });
}

// Auto-run when this file is the direct entry point (e.g. `tsx src/index.ts` or `node dist/index.js`).
// When imported by the CLI package, CLSH_CLI=1 is set so we skip auto-run.
if (!process.env['CLSH_CLI']) {
  main().catch((err: unknown) => {
    console.error('Fatal error starting clsh agent:', err);
    process.exit(1);
  });
}
