import { useState, useRef, useEffect, useCallback } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import { TitleBar } from './TitleBar'
import { ContextStrip } from './ContextStrip'
import { PinnedCommandsStrip, type PinnedCommand } from './PinnedCommandsStrip'
import { ClipboardBridge, extractLastOutput } from './ClipboardBridge'
import { MacBookKeyboard } from './MacBookKeyboard'
import { IOSKeyboard } from './IOSKeyboard'
import { TerminalAccessoryBar } from './TerminalAccessoryBar'
import type { TerminalViewProps } from '../lib/types'

/**
 * Full-screen terminal view for the phone UI.
 *
 * Layout (top to bottom, 100dvh):
 *   TitleBar (44px) -> xterm.js (flex:1) -> ContextStrip (48px) -> MacBookKeyboard (~244px)
 */
export function TerminalView({
  session,
  active,
  wsClient,
  messageBus,
  getSessionOutput,
  onBack,
  onRenameSession,
  onOpenSettings,
  skin,
  perKeyColors,
  nativeKeyboard,
  terminalTheme,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminal, write, getDimensions, fit, captureScreen, scrollToBottom } = useTerminal(
    containerRef,
    { nativeKeyboard, theme: terminalTheme },
  )
  const activeRef = useRef(active)
  activeRef.current = active

  // Re-fit terminal when becoming visible (container goes from display:none to flex)
  const prevActiveRef = useRef(active)
  useEffect(() => {
    if (active && !prevActiveRef.current && terminal) {
      fit()
    }
    prevActiveRef.current = active
  }, [active, terminal, fit])

  // Pinned commands for this session — fetched once on mount, matched by initial name
  const [pinnedCommands, setPinnedCommands] = useState<PinnedCommand[]>([])
  const initialNameRef = useRef(session.name)

  useEffect(() => {
    void (async () => {
      try {
        const headers: Record<string, string> = {}
        const jwt = localStorage.getItem('clsh_jwt')
        if (jwt) headers['Authorization'] = `Bearer ${jwt}`
        const res = await fetch('/api/templates', { headers })
        if (!res.ok) return
        const data = (await res.json()) as {
          templates: Array<{ name: string; pinnedCommands?: PinnedCommand[] }>
          pinnedCommands: PinnedCommand[]
        }
        // Find template matching the session's initial name (stable, not cwd-updated name)
        const template = data.templates.find((t) => t.name === initialNameRef.current)
        const templateCmds = template?.pinnedCommands ?? []
        const globalCmds = data.pinnedCommands ?? []
        setPinnedCommands([...templateCmds, ...globalCmds])
      } catch {
        // No pinned commands available
      }
    })()
  }, [])

  // Clipboard toast state
  const [clipboardToast, setClipboardToast] = useState<string | null>(null)
  const clipboardToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showClipboardToast = useCallback((msg: string) => {
    setClipboardToast(msg)
    if (clipboardToastTimer.current) clearTimeout(clipboardToastTimer.current)
    clipboardToastTimer.current = setTimeout(() => setClipboardToast(null), 1500)
  }, [])
  useEffect(() => {
    return () => {
      if (clipboardToastTimer.current) clearTimeout(clipboardToastTimer.current)
    }
  }, [])

  // Rename editing state — lifted here so we can intercept keyboard input
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Replay stored history then subscribe to new output for this session.
  useEffect(() => {
    if (!terminal) return

    const history = getSessionOutput(session.id)
    for (const chunk of history) {
      write(chunk)
    }

    const unsubscribe = messageBus.subscribe((msg) => {
      if ((msg.type === 'stdout' || msg.type === 'stderr') && msg.sessionId === session.id) {
        write(msg.data)
      }
    })

    return unsubscribe
  }, [terminal, messageBus, session.id, write, getSessionOutput])

  // Wire terminal resize to WebSocket (only send when this terminal is active)
  useEffect(() => {
    if (!terminal || !wsClient) return

    const onResizeDisposable = terminal.onResize((size: { cols: number; rows: number }) => {
      if (!activeRef.current || size.cols <= 0 || size.rows <= 0) return
      wsClient.send({
        type: 'resize',
        sessionId: session.id,
        cols: size.cols,
        rows: size.rows,
      })
    })

    if (active) {
      const dims = getDimensions()
      if (dims && dims.cols > 0 && dims.rows > 0) {
        wsClient.send({
          type: 'resize',
          sessionId: session.id,
          cols: dims.cols,
          rows: dims.rows,
        })
      }
    }

    return () => {
      onResizeDisposable.dispose()
    }
  }, [terminal, wsClient, session.id, getDimensions, active])

  const startRename = useCallback(() => {
    setRenameValue(session.name)
    setRenaming(true)
  }, [session.name])

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== session.name) {
      onRenameSession(session.id, trimmed)
    }
    setRenaming(false)
  }, [renameValue, session.name, session.id, onRenameSession])

  const cancelRename = useCallback(() => {
    setRenaming(false)
  }, [])

  // Key handler: routes to rename input or terminal WebSocket
  const handleKey = useCallback(
    (data: string) => {
      if (renaming) {
        if (data === '\r') {
          // Enter → commit
          commitRename()
        } else if (data === '\x1b') {
          // Escape → cancel
          cancelRename()
        } else if (data === '\x7f') {
          // Backspace → delete last char
          setRenameValue((v) => v.slice(0, -1))
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          // Printable character → append
          setRenameValue((v) => v + data)
        }
        return
      }
      // Clipboard bridge: copy last output via the ClipboardBridge's exposed function
      if (data === '__CLIPBOARD__') {
        const output = getSessionOutput(session.id)
        if (output.length > 0) {
          const text = extractLastOutput(output)
          if (text) {
            void navigator.clipboard
              .writeText(text)
              .then(() => showClipboardToast('Copied!'))
              .catch(() => showClipboardToast('Copy failed'))
          } else {
            showClipboardToast('Nothing to copy')
          }
        }
        return
      }
      scrollToBottom()
      wsClient?.send({ type: 'stdin', sessionId: session.id, data })
    },
    [
      renaming,
      commitRename,
      cancelRename,
      wsClient,
      session.id,
      scrollToBottom,
      getSessionOutput,
      showClipboardToast,
    ],
  )

  // When native keyboard is enabled, wire xterm's onData to send keystrokes.
  // Keep this minimal — the simple version is proven to work on Android.
  // IME protection (autocorrect, dedup, textarea clearing) was added in the
  // stabilization pass but broke Android keyboard input entirely by adding
  // event listeners that disrupted the IME framework.  If IME issues resurface,
  // they must be addressed WITHOUT adding input/composition event listeners
  // to the textarea or its ancestors.
  useEffect(() => {
    if (!terminal || !nativeKeyboard) return
    const disposable = terminal.onData((data: string) => {
      handleKey(data)
    })
    return () => disposable.dispose()
  }, [terminal, nativeKeyboard, handleKey])

  const handleBack = useCallback(() => {
    onBack(captureScreen())
  }, [onBack, captureScreen])

  return (
    <div
      style={{
        height: '100%',
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        background: '#0a0a0a',
        overflow: 'hidden',
      }}
      data-skin={skin}
    >
      <TitleBar
        session={session}
        onBack={handleBack}
        onOpenSettings={onOpenSettings}
        editing={renaming}
        editValue={renameValue}
        onEditStart={startRename}
        onEditCommit={commitRename}
        onEditCancel={cancelRename}
      />

      {/* Terminal area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      />

      <ClipboardBridge getOutput={() => getSessionOutput(session.id)} visible={true} />

      {/* Toast for context strip clipboard button */}
      {clipboardToast && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 12px',
            borderRadius: 6,
            background: 'rgba(40, 200, 64, 0.2)',
            border: '1px solid rgba(40, 200, 64, 0.4)',
            color: '#28c840',
            fontSize: 11,
            fontFamily: '"JetBrains Mono", monospace',
            zIndex: 41,
          }}
        >
          {clipboardToast}
        </div>
      )}

      <PinnedCommandsStrip commands={pinnedCommands} onExecute={handleKey} />

      {nativeKeyboard ? (
        <TerminalAccessoryBar onKey={handleKey} />
      ) : (
        <>
          <ContextStrip onKey={handleKey} />
          {skin === 'ios-terminal' ? (
            <IOSKeyboard onKey={handleKey} skin={skin} perKeyColors={perKeyColors} />
          ) : (
            <MacBookKeyboard onKey={handleKey} skin={skin} perKeyColors={perKeyColors} />
          )}
        </>
      )}
    </div>
  )
}
