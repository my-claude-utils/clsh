import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { verifyJWT } from './auth.js';
import { PTYManager, type PTYSession } from './pty-manager.js';
import type { ClientMessage, ServerMessage, ShellType } from './types.js';

/** WebSocket close codes. */
const WS_CLOSE_UNAUTHORIZED = 4001;
const WS_CLOSE_NORMAL = 1000;

/** Timeout for initial auth message (5 seconds). */
const AUTH_TIMEOUT_MS = 5_000;

/** Subscriptions map: which sessions each WebSocket client is subscribed to. */
type SubscriptionMap = Map<WebSocket, Set<string>>;

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: 'error', message });
}

function isValidShell(shell: unknown): shell is ShellType {
  return shell === 'bash' || shell === 'zsh' || shell === 'tmux' || shell === 'claude';
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

/**
 * Sets up the WebSocket handler on the given WebSocketServer.
 * Authenticates connections via JWT in the query string, then routes
 * messages to the PTY manager.
 */
export function setupWebSocketHandler(
  wss: WebSocketServer,
  ptyManager: PTYManager,
  jwtSecret: string,
): void {
  const subscriptions: SubscriptionMap = new Map();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(ws, req, ptyManager, jwtSecret, subscriptions);
  });
}

async function handleConnection(
  ws: WebSocket,
  _req: IncomingMessage,
  ptyManager: PTYManager,
  jwtSecret: string,
  subscriptions: SubscriptionMap,
): Promise<void> {
  // H5: Auth via first WS message instead of query param.
  // Wait for { type: 'auth', token: '...' } as the first message.
  const authTimeout = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'auth_error', message: 'Authentication timeout' });
      ws.close(WS_CLOSE_UNAUTHORIZED, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  ws.once('message', (rawData: Buffer | string) => {
    clearTimeout(authTimeout);
    void (async () => {
      const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      let parsed: { type?: string; token?: string };
      try {
        parsed = JSON.parse(data) as { type?: string; token?: string };
      } catch {
        send(ws, { type: 'auth_error', message: 'Invalid message format' });
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Invalid auth message');
        return;
      }

      if (parsed.type !== 'auth' || !parsed.token) {
        send(ws, { type: 'auth_error', message: 'First message must be auth' });
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Missing auth message');
        return;
      }

      try {
        await verifyJWT(parsed.token, jwtSecret);
      } catch {
        send(ws, { type: 'auth_error', message: 'Invalid or expired token' });
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Invalid or expired token');
        return;
      }

      // Authentication succeeded
      send(ws, { type: 'auth_ok' });
      setupAuthenticatedHandlers(ws, ptyManager, subscriptions);
    })();
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    subscriptions.delete(ws);
  });

  ws.on('error', () => {
    clearTimeout(authTimeout);
    subscriptions.delete(ws);
  });
}

function setupAuthenticatedHandlers(
  ws: WebSocket,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  (ws as unknown as { isAlive: boolean }).isAlive = true;
  ws.on('pong', () => { (ws as unknown as { isAlive: boolean }).isAlive = true; });
  subscriptions.set(ws, new Set());

  ws.on('message', (rawData: Buffer | string) => {
    const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
    const message = parseClientMessage(data);

    if (!message) {
      sendError(ws, 'Invalid message format');
      return;
    }

    handleMessage(ws, message, ptyManager, subscriptions);
  });
}

function handleMessage(
  ws: WebSocket,
  message: ClientMessage,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  switch (message.type) {
    case 'ping':
      send(ws, { type: 'pong' });
      break;

    case 'session_create':
      handleSessionCreate(ws, message.shell, message.name, ptyManager, subscriptions);
      break;

    case 'session_subscribe':
      handleSessionSubscribe(ws, message.sessionId, ptyManager, subscriptions);
      break;

    case 'session_close':
      handleSessionClose(ws, message.sessionId, ptyManager, subscriptions);
      break;

    case 'session_rename':
      handleSessionRename(ws, message.sessionId, message.name, ptyManager);
      break;

    case 'session_list':
      handleSessionList(ws, ptyManager);
      break;

    case 'stdin':
      handleStdin(ws, message.sessionId, message.data, ptyManager);
      break;

    case 'resize':
      handleResize(ws, message.sessionId, message.cols, message.rows, ptyManager);
      break;
  }
}

function handleSessionCreate(
  ws: WebSocket,
  shell: ShellType | unknown,
  name: string | undefined,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  if (!isValidShell(shell)) {
    sendError(ws, `Invalid shell type: ${String(shell)}`);
    return;
  }

  let session: PTYSession;
  try {
    session = ptyManager.create(shell, 80, 24, name);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to create session';
    sendError(ws, errMsg);
    return;
  }

  // Subscribe this client to the new session
  const clientSubs = subscriptions.get(ws);
  if (clientSubs) {
    clientSubs.add(session.id);
  }

  // Send session info back to client
  send(ws, {
    type: 'session',
    sessionId: session.id,
    shell,
    pid: session.pty.pid,
    name: session.name,
    cwd: session.cwd,
    status: session.status,
  });

  // Replay buffer for reconnection
  for (const chunk of session.buffer) {
    send(ws, { type: 'stdout', sessionId: session.id, data: chunk });
  }

  // Stream PTY output to this WebSocket client
  session.onData((data: string) => {
    const subs = subscriptions.get(ws);
    if (subs?.has(session.id)) {
      send(ws, { type: 'stdout', sessionId: session.id, data });
    }
  });

  // Stream session metadata updates to this WebSocket client
  session.onUpdate((meta) => {
    const subs = subscriptions.get(ws);
    if (subs?.has(session.id)) {
      send(ws, { type: 'session_update', sessionId: session.id, ...meta });
    }
  });

  // Notify client when the session exits
  session.onExit((event) => {
    send(ws, {
      type: 'exit',
      sessionId: session.id,
      exitCode: event.exitCode,
      signal: event.signal,
    });

    const subs = subscriptions.get(ws);
    if (subs) {
      subs.delete(session.id);
    }
  });
}

function handleSessionSubscribe(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  const session = ptyManager.get(sessionId);
  if (!session) {
    sendError(ws, `Session not found: ${sessionId}`);
    return;
  }

  // Subscribe this client
  const clientSubs = subscriptions.get(ws);
  if (clientSubs) {
    if (clientSubs.has(sessionId)) return; // already subscribed
    clientSubs.add(sessionId);
  }

  // Send session info
  send(ws, {
    type: 'session',
    sessionId: session.id,
    shell: session.shell,
    pid: session.pty.pid,
    name: session.name,
    cwd: session.cwd,
    status: session.status,
  });

  // Replay buffer
  for (const chunk of session.buffer) {
    send(ws, { type: 'stdout', sessionId: session.id, data: chunk });
  }

  // Wire up live streaming
  session.onData((data: string) => {
    const subs = subscriptions.get(ws);
    if (subs?.has(session.id)) {
      send(ws, { type: 'stdout', sessionId: session.id, data });
    }
  });

  session.onUpdate((meta) => {
    const subs = subscriptions.get(ws);
    if (subs?.has(session.id)) {
      send(ws, { type: 'session_update', sessionId: session.id, ...meta });
    }
  });

  session.onExit((event) => {
    send(ws, {
      type: 'exit',
      sessionId: session.id,
      exitCode: event.exitCode,
      signal: event.signal,
    });
    const subs = subscriptions.get(ws);
    if (subs) {
      subs.delete(session.id);
    }
  });
}

function handleSessionClose(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  ptyManager.destroy(sessionId);
  const subs = subscriptions.get(ws);
  if (subs) {
    subs.delete(sessionId);
  }
  send(ws, { type: 'exit', sessionId, exitCode: 0 });
}

function handleSessionList(ws: WebSocket, ptyManager: PTYManager): void {
  const sessions = ptyManager.list().map((s) => ({
    id: s.id,
    shell: s.shell,
    pid: s.pty.pid,
    name: s.name,
    cwd: s.cwd,
    status: s.status,
  }));

  send(ws, { type: 'session_list', sessions });
}

function handleSessionRename(
  ws: WebSocket,
  sessionId: string,
  name: string,
  ptyManager: PTYManager,
): void {
  try {
    ptyManager.rename(sessionId, name);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Rename failed';
    sendError(ws, errMsg);
  }
}

function handleStdin(
  ws: WebSocket,
  sessionId: string,
  data: string,
  ptyManager: PTYManager,
): void {
  try {
    ptyManager.write(sessionId, data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Write failed';
    sendError(ws, errMsg);
  }
}

function handleResize(
  ws: WebSocket,
  sessionId: string,
  cols: number,
  rows: number,
  ptyManager: PTYManager,
): void {
  try {
    ptyManager.resize(sessionId, cols, rows);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Resize failed';
    sendError(ws, errMsg);
  }
}

export { WS_CLOSE_UNAUTHORIZED, WS_CLOSE_NORMAL };
