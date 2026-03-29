import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { TerminalWSClient, type ConnectionStatus } from '../lib/ws-client'
import { MessageBus } from '../lib/message-bus'
import { captureColoredScreen } from '../lib/captureTerminalScreen'
import { CLSH_THEME } from '../lib/theme'
import type { Session } from '../lib/types'
import type { ServerMessage } from '../lib/protocol'

/** Max raw output chunks stored per session for history replay. */
const MAX_RAW_CHUNKS = 500

/** Debounce time for auto-snapshot (ms). */
const SNAPSHOT_DEBOUNCE = 300

export interface CreateSessionOptions {
  shell?: 'bash' | 'zsh' | 'tmux' | 'claude'
  name?: string
  cwd?: string
}

export interface UseSessionManagerReturn {
  sessions: Session[]
  wsClient: TerminalWSClient | null
  messageBus: MessageBus
  createSession: (options?: CreateSessionOptions) => void
  closeSession: (sessionId: string) => void
  getSession: (sessionId: string) => Session | undefined
  /** Returns raw (ANSI-intact) output chunks for a session — used to replay history into xterm */
  getSessionOutput: (sessionId: string) => string[]
  /** Stores an xterm screen capture for display in the session grid card */
  setSessionSnapshot: (sessionId: string, snapshot: string) => void
  /** Renames a session (client-side only) */
  renameSession: (sessionId: string, name: string) => void
  /** Restarts an exited session (e.g., Claude that finished or crashed) */
  restartSession: (sessionId: string) => void
  status: ConnectionStatus
}

export function useSessionManager(
  auth: { isAuthenticated: boolean; token: string | null },
  onUnauthorized?: () => void,
): UseSessionManagerReturn {
  const [sessions, setSessions] = useState<Session[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [wsClient, setWsClient] = useState<TerminalWSClient | null>(null)
  const wsClientRef = useRef<TerminalWSClient | null>(null)
  const messageBusRef = useRef(new MessageBus())
  /** Raw output per session — capped at MAX_RAW_CHUNKS for history replay */
  const rawOutputBuffers = useRef<Map<string, string[]>>(new Map())
  /** Headless xterm.js instances for generating accurate preview snapshots */
  const headlessTerminals = useRef<Map<string, Terminal>>(new Map())
  /** Debounce timers for snapshot generation */
  const snapshotTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup headless terminals on unmount
  useEffect(() => {
    return () => {
      for (const term of headlessTerminals.current.values()) {
        term.dispose()
      }
      headlessTerminals.current.clear()
      for (const timer of snapshotTimers.current.values()) {
        clearTimeout(timer)
      }
      snapshotTimers.current.clear()
    }
  }, [])

  /** Get or create a headless terminal for a session. */
  function getHeadless(sessionId: string): Terminal {
    let term = headlessTerminals.current.get(sessionId)
    if (!term) {
      term = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
        theme: CLSH_THEME,
      })
      headlessTerminals.current.set(sessionId, term)
    }
    return term
  }

  /** Schedule a debounced snapshot capture for a session. */
  function scheduleSnapshot(sessionId: string): void {
    const existing = snapshotTimers.current.get(sessionId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      snapshotTimers.current.delete(sessionId)
      const term = headlessTerminals.current.get(sessionId)
      if (!term) return
      const snapshot = captureColoredScreen(term)
      if (snapshot) {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, snapshot } : s)))
      }
    }, SNAPSHOT_DEBOUNCE)
    snapshotTimers.current.set(sessionId, timer)
  }

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // In dev mode on localhost, connect directly to agent port to bypass Vite's
    // WS proxy (ECONNRESET in some WSL setups). For remote access (phone via
    // tunnel), use Vite's /ws proxy since only the Vite port is tunneled.
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    const wsUrl =
      import.meta.env.DEV && isLocal
        ? `ws://${window.location.hostname}:${__DEV_AGENT_PORT__}/ws`
        : `${protocol}//${window.location.host}/ws`

    const client = new TerminalWSClient({
      url: wsUrl,
      sessionId: '',
      token: auth.token,
      onMessage: (msg: ServerMessage) => {
        messageBusRef.current.publish(msg)
        handleMessage(msg)
      },
      onStatusChange: (s: ConnectionStatus) => {
        setStatus(s)
        if (s === 'connected') {
          client.send({ type: 'session_list' })
        }
        // Do NOT clear sessions on disconnect — keep stale state visible.
        // session_list on reconnect will merge with existing state.
      },
      onUnauthorized,
    })

    wsClientRef.current = client
    setWsClient(client)
    void client.connect()

    return () => {
      client.disconnect()
      wsClientRef.current = null
      setWsClient(null)
    }
  }, [auth.isAuthenticated, auth.token])

  function handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'session': {
        const newSession: Session = {
          id: msg.sessionId,
          name: msg.name,
          cwd: msg.cwd,
          status: msg.status,
          shell: msg.shell as Session['shell'],
          pid: msg.pid,
          preview: '',
          createdAt: msg.createdAt,
          attachedClients: msg.attachedClients,
        }
        setSessions((prev) => {
          const exists = prev.find((s) => s.id === msg.sessionId)
          if (exists) return prev
          return [...prev, newSession]
        })
        break
      }

      case 'session_list': {
        setSessions((prev) => {
          // Build a lookup of existing sessions to preserve snapshots/previews
          const existing = new Map(prev.map((s) => [s.id, s]))
          return msg.sessions.map((s) => {
            const old = existing.get(s.id)
            return {
              id: s.id,
              name: s.name,
              cwd: s.cwd,
              status: s.status,
              shell: s.shell as Session['shell'],
              pid: s.pid,
              preview: old?.preview ?? '',
              snapshot: old?.snapshot,
              icon: old?.icon,
              cost: old?.cost,
              createdAt: s.createdAt ?? old?.createdAt,
              attachedClients: s.attachedClients ?? old?.attachedClients,
            }
          })
        })
        // Re-subscribe to all existing sessions to restore output streaming
        for (const s of msg.sessions) {
          wsClientRef.current?.send({ type: 'session_subscribe', sessionId: s.id })
        }
        break
      }

      case 'session_update': {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === msg.sessionId
              ? {
                  ...s,
                  name: msg.name,
                  cwd: msg.cwd,
                  status: msg.status,
                  ...(msg.cost != null ? { cost: msg.cost } : {}),
                  ...(msg.attachedClients != null ? { attachedClients: msg.attachedClients } : {}),
                }
              : s,
          ),
        )
        break
      }

      case 'exit': {
        // Check if the session has 'exited' status (tmux remain-on-exit).
        // If so, the session_update handler already set status='exited' — don't remove it.
        // Only remove sessions that were explicitly killed (session_close).
        // Cleanup is done inside the updater to avoid stale closure on `sessions`.
        setSessions((prev) => {
          const session = prev.find((s) => s.id === msg.sessionId)
          if (session?.status === 'exited') return prev // keep exited sessions visible

          // Session is truly gone — cleanup buffers/terminals
          rawOutputBuffers.current.delete(msg.sessionId)
          const term = headlessTerminals.current.get(msg.sessionId)
          if (term) {
            term.dispose()
            headlessTerminals.current.delete(msg.sessionId)
          }
          const timer = snapshotTimers.current.get(msg.sessionId)
          if (timer) {
            clearTimeout(timer)
            snapshotTimers.current.delete(msg.sessionId)
          }

          return prev.filter((s) => s.id !== msg.sessionId)
        })
        break
      }

      case 'detached': {
        // Session was detached (persists in tmux) — remove from UI but keep tmux alive
        setSessions((prev) => {
          rawOutputBuffers.current.delete(msg.sessionId)
          const term = headlessTerminals.current.get(msg.sessionId)
          if (term) {
            term.dispose()
            headlessTerminals.current.delete(msg.sessionId)
          }
          const timer = snapshotTimers.current.get(msg.sessionId)
          if (timer) {
            clearTimeout(timer)
            snapshotTimers.current.delete(msg.sessionId)
          }
          return prev.filter((s) => s.id !== msg.sessionId)
        })
        break
      }

      case 'stdout':
      case 'stderr': {
        // Write to headless terminal for accurate preview rendering
        const headless = getHeadless(msg.sessionId)
        headless.write(msg.data)
        scheduleSnapshot(msg.sessionId)

        // Raw output buffer: preserves ANSI for xterm history replay
        const chunks = rawOutputBuffers.current.get(msg.sessionId) ?? []
        chunks.push(msg.data)
        if (chunks.length > MAX_RAW_CHUNKS) chunks.shift()
        rawOutputBuffers.current.set(msg.sessionId, chunks)
        break
      }
    }
  }

  const createSession = useCallback(
    (options?: CreateSessionOptions): void => {
      wsClient?.send({
        type: 'session_create',
        ...(options?.shell ? { shell: options.shell } : {}),
        ...(options?.name ? { name: options.name } : {}),
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      })
    },
    [wsClient],
  )

  const closeSession = useCallback(
    (sessionId: string): void => {
      wsClient?.send({ type: 'session_close', sessionId })
    },
    [wsClient],
  )

  const getSession = useCallback(
    (sessionId: string): Session | undefined => {
      return sessions.find((s) => s.id === sessionId)
    },
    [sessions],
  )

  const getSessionOutput = useCallback((sessionId: string): string[] => {
    return rawOutputBuffers.current.get(sessionId) ?? []
  }, [])

  const setSessionSnapshot = useCallback((sessionId: string, snapshot: string): void => {
    if (!snapshot) return
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, snapshot } : s)))
  }, [])

  const renameSession = useCallback((sessionId: string, name: string): void => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, name } : s)))
    wsClientRef.current?.send({ type: 'session_rename', sessionId, name })
  }, [])

  const restartSession = useCallback(
    (sessionId: string): void => {
      wsClient?.send({ type: 'session_restart', sessionId })
    },
    [wsClient],
  )

  return {
    sessions,
    wsClient,
    messageBus: messageBusRef.current,
    createSession,
    closeSession,
    getSession,
    getSessionOutput,
    setSessionSnapshot,
    renameSession,
    restartSession,
    status,
  }
}
