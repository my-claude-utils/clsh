import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import { verifySession } from './auth.js'
import { auditLog } from './audit.js'
import type { DbStatements } from './db.js'
import { PTYManager, type PTYSession } from './pty-manager.js'
import type { ClientMessage, ServerMessage, ShellType } from './types.js'
import type { ResolvedAuth } from './auth-config.js'
import type { NotificationManager } from './notifications/manager.js'

/** WebSocket close codes. */
const WS_CLOSE_UNAUTHORIZED = 4001
const WS_CLOSE_NORMAL = 1000

/** Timeout for initial auth message (5 seconds). */
const AUTH_TIMEOUT_MS = 5_000

/** Maximum stdin data size in bytes (Finding #6). */
const MAX_STDIN_SIZE = 4096

/** Subscriptions map: which sessions each WebSocket client is subscribed to. */
type SubscriptionMap = Map<WebSocket, Set<string>>

/** Disposables map: unsubscribe functions for session callbacks per WebSocket client. */
type DisposableMap = Map<WebSocket, Array<() => void>>

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: 'error', message })
}

/** Cleans up subscriptions and disposables for a disconnected WebSocket client. */
function cleanupConnection(
  ws: WebSocket,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  const subs = subscriptions.get(ws)
  if (subs) {
    for (const sessionId of subs) {
      ptyManager.decrementAttached(sessionId)
    }
  }
  const wsDisposables = disposables.get(ws)
  if (wsDisposables) {
    for (const dispose of wsDisposables) dispose()
    disposables.delete(ws)
  }
  subscriptions.delete(ws)
}

/** Extracts an error message, falling back to a default string for non-Error values. */
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function isValidShell(shell: unknown): shell is ShellType {
  return shell === 'bash' || shell === 'zsh' || shell === 'tmux' || shell === 'claude'
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
      return null
    }
    return parsed as ClientMessage
  } catch {
    return null
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
  statements: DbStatements,
  authMode?: ResolvedAuth,
  notificationManager?: NotificationManager,
): void {
  const subscriptions: SubscriptionMap = new Map()
  const disposables: DisposableMap = new Map()

  // Subscribe to in-app notifications and broadcast to all authenticated clients
  let disposeNotificationListener: (() => void) | null = null
  if (notificationManager) {
    disposeNotificationListener = notificationManager.onNotification((sessionId, payload) => {
      const msg: ServerMessage = {
        type: 'notification',
        sessionId,
        sessionName: payload.session,
        trigger: payload.trigger,
        label: payload.label,
        matched: payload.matched,
        timestamp: payload.timestamp,
      }
      for (const [ws] of subscriptions) {
        send(ws, msg)
      }
    })
  }

  wss.on('close', () => {
    disposeNotificationListener?.()
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(
      ws,
      req,
      ptyManager,
      jwtSecret,
      statements,
      subscriptions,
      disposables,
      authMode,
    )
  })
}

async function handleConnection(
  ws: WebSocket,
  _req: IncomingMessage,
  ptyManager: PTYManager,
  jwtSecret: string,
  statements: DbStatements,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
  authMode?: ResolvedAuth,
): Promise<void> {
  // Tailscale mode: skip auth entirely — trust the network
  if (authMode?.mode === 'tailscale') {
    send(ws, { type: 'auth_ok' })
    auditLog('ws.connected', { ip: _req.socket.remoteAddress, authSkipped: true })
    setupAuthenticatedHandlers(ws, ptyManager, subscriptions, disposables)
    return
  }

  // H5: Auth via first WS message instead of query param.
  // Wait for { type: 'auth', token: '...' } as the first message.
  const authTimeout = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'auth_error', message: 'Authentication timeout' })
      ws.close(WS_CLOSE_UNAUTHORIZED, 'Authentication timeout')
    }
  }, AUTH_TIMEOUT_MS)

  ws.once('message', (rawData: Buffer | string) => {
    clearTimeout(authTimeout)
    void (async () => {
      const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8')
      let parsed: { type?: string; token?: string }
      try {
        parsed = JSON.parse(data) as { type?: string; token?: string }
      } catch {
        send(ws, { type: 'auth_error', message: 'Invalid message format' })
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Invalid auth message')
        return
      }

      if (parsed.type !== 'auth' || !parsed.token) {
        send(ws, { type: 'auth_error', message: 'First message must be auth' })
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Missing auth message')
        return
      }

      try {
        await verifySession(parsed.token, jwtSecret, statements)
      } catch {
        send(ws, { type: 'auth_error', message: 'Invalid or expired token' })
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Invalid or expired token')
        auditLog('ws.auth.failed', { ip: _req.socket.remoteAddress })
        return
      }

      // Authentication succeeded
      send(ws, { type: 'auth_ok' })
      auditLog('ws.connected', { ip: _req.socket.remoteAddress })
      setupAuthenticatedHandlers(ws, ptyManager, subscriptions, disposables)
    })()
  })

  ws.on('close', () => {
    clearTimeout(authTimeout)
    cleanupConnection(ws, ptyManager, subscriptions, disposables)
    auditLog('ws.disconnected', { ip: _req.socket.remoteAddress })
  })

  ws.on('error', () => {
    clearTimeout(authTimeout)
    cleanupConnection(ws, ptyManager, subscriptions, disposables)
  })
}

function setupAuthenticatedHandlers(
  ws: WebSocket,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  ;(ws as unknown as { isAlive: boolean }).isAlive = true
  ws.on('pong', () => {
    ;(ws as unknown as { isAlive: boolean }).isAlive = true
  })
  subscriptions.set(ws, new Set())

  ws.on('message', (rawData: Buffer | string) => {
    const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8')
    const message = parseClientMessage(data)

    if (!message) {
      sendError(ws, 'Invalid message format')
      return
    }

    handleMessage(ws, message, ptyManager, subscriptions, disposables)
  })
}

function handleMessage(
  ws: WebSocket,
  message: ClientMessage,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  switch (message.type) {
    case 'ping':
      send(ws, { type: 'pong' })
      break

    case 'session_create':
      handleSessionCreate(
        ws,
        message.shell,
        message.name,
        message.cwd,
        ptyManager,
        subscriptions,
        disposables,
      )
      break

    case 'session_subscribe':
      handleSessionSubscribe(ws, message.sessionId, ptyManager, subscriptions, disposables)
      break

    case 'session_close':
      handleSessionClose(ws, message.sessionId, ptyManager, subscriptions)
      break

    case 'session_rename':
      handleSessionRename(ws, message.sessionId, message.name, ptyManager)
      break

    case 'session_list':
      handleSessionList(ws, ptyManager)
      break

    case 'session_restart':
      handleSessionRestart(ws, message.sessionId, ptyManager, subscriptions, disposables)
      break

    case 'session_detach':
      handleSessionDetach(ws, message.sessionId, ptyManager, subscriptions)
      break

    case 'stdin':
      handleStdin(ws, message.sessionId, message.data, ptyManager)
      break

    case 'resize':
      handleResize(ws, message.sessionId, message.cols, message.rows, ptyManager)
      break
  }
}

function handleSessionCreate(
  ws: WebSocket,
  shell: ShellType | undefined | unknown,
  name: string | undefined,
  cwd: string | undefined,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  // If shell is provided, validate it; if omitted, PTYManager uses its defaultShell
  if (shell !== undefined && !isValidShell(shell)) {
    sendError(ws, `Invalid shell type: ${String(shell)}`)
    return
  }

  let session: PTYSession
  try {
    session = ptyManager.create(shell, 80, 24, name, cwd)
  } catch (err) {
    sendError(ws, errorMessage(err, 'Failed to create session'))
    return
  }

  wireSessionToClient(ws, session, ptyManager, subscriptions, disposables)
}

function handleSessionSubscribe(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  const session = ptyManager.get(sessionId)
  if (!session) {
    sendError(ws, `Session not found: ${sessionId}`)
    return
  }

  // Skip if already subscribed
  const clientSubs = subscriptions.get(ws)
  if (clientSubs?.has(sessionId)) return

  wireSessionToClient(ws, session, ptyManager, subscriptions, disposables)
}

/**
 * Subscribes a WebSocket client to a PTY session: registers the subscription,
 * sends current session info, replays the output buffer, and wires up live
 * data/update/exit listeners.
 */
function wireSessionToClient(
  ws: WebSocket,
  session: PTYSession,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  const clientSubs = subscriptions.get(ws)
  if (clientSubs) clientSubs.add(session.id)
  ptyManager.incrementAttached(session.id)

  // Send session info
  send(ws, {
    type: 'session',
    sessionId: session.id,
    shell: session.shell,
    pid: session.pty.pid,
    name: session.name,
    cwd: session.cwd,
    status: session.status,
  })

  // Replay output buffer
  for (const chunk of session.buffer) {
    send(ws, { type: 'stdout', sessionId: session.id, data: chunk })
  }

  // Wire up live streaming
  const wsDisposables = disposables.get(ws) ?? []
  disposables.set(ws, wsDisposables)

  wsDisposables.push(
    session.onData((data: string) => {
      const subs = subscriptions.get(ws)
      if (subs?.has(session.id)) {
        send(ws, { type: 'stdout', sessionId: session.id, data })
      }
    }),
  )

  wsDisposables.push(
    session.onUpdate((meta) => {
      const subs = subscriptions.get(ws)
      if (subs?.has(session.id)) {
        send(ws, { type: 'session_update', sessionId: session.id, ...meta })
      }
    }),
  )

  wsDisposables.push(
    session.onExit((event) => {
      send(ws, {
        type: 'exit',
        sessionId: session.id,
        exitCode: event.exitCode,
        signal: event.signal,
      })
      const subs = subscriptions.get(ws)
      if (subs) subs.delete(session.id)
    }),
  )
}

function handleSessionClose(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  ptyManager.destroy(sessionId)
  const subs = subscriptions.get(ws)
  if (subs) {
    subs.delete(sessionId)
  }
  send(ws, { type: 'exit', sessionId, exitCode: 0 })
}

function handleSessionList(ws: WebSocket, ptyManager: PTYManager): void {
  const sessions = ptyManager.list().map((s) => ({
    id: s.id,
    shell: s.shell,
    pid: s.pty.pid,
    name: s.name,
    cwd: s.cwd,
    status: s.status,
    createdAt: s.createdAt,
    attachedClients: s.attachedClients,
  }))

  send(ws, { type: 'session_list', sessions })
}

function handleSessionRestart(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
  disposables: DisposableMap,
): void {
  try {
    const restarted = ptyManager.restartSession(sessionId)
    if (!restarted) {
      sendError(ws, 'Cannot restart session — not in exited state or not found')
      return
    }
    // Auto-subscribe to the restarted session
    handleSessionSubscribe(ws, sessionId, ptyManager, subscriptions, disposables)
  } catch (err) {
    sendError(ws, errorMessage(err, 'Restart failed'))
  }
}

function handleSessionDetach(
  ws: WebSocket,
  sessionId: string,
  ptyManager: PTYManager,
  subscriptions: SubscriptionMap,
): void {
  try {
    ptyManager.detach(sessionId)
    // Remove from this client's subscriptions
    const subs = subscriptions.get(ws)
    if (subs) subs.delete(sessionId)
    send(ws, { type: 'detached', sessionId })
  } catch (err) {
    sendError(ws, errorMessage(err, 'Detach failed'))
  }
}

function handleSessionRename(
  ws: WebSocket,
  sessionId: string,
  name: string,
  ptyManager: PTYManager,
): void {
  try {
    ptyManager.rename(sessionId, name)
  } catch (err) {
    sendError(ws, errorMessage(err, 'Rename failed'))
  }
}

function handleStdin(ws: WebSocket, sessionId: string, data: string, ptyManager: PTYManager): void {
  if (data.length > MAX_STDIN_SIZE) {
    sendError(ws, `stdin data too large (${data.length} bytes, max ${MAX_STDIN_SIZE})`)
    return
  }
  try {
    ptyManager.write(sessionId, data)
  } catch (err) {
    sendError(ws, errorMessage(err, 'Write failed'))
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
    ptyManager.resize(sessionId, cols, rows)
  } catch (err) {
    sendError(ws, errorMessage(err, 'Resize failed'))
  }
}

export { WS_CLOSE_UNAUTHORIZED, WS_CLOSE_NORMAL }
