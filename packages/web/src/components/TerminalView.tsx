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
  wsClient,
  messageBus,
  getSessionOutput,
  onBack,
  onRenameSession,
  onOpenSettings,
  skin,
  perKeyColors,
  nativeKeyboard,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminal, write, getDimensions, captureScreen, scrollToBottom } = useTerminal(
    containerRef,
    { nativeKeyboard },
  )

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

  // Wire terminal resize to WebSocket
  useEffect(() => {
    if (!terminal || !wsClient) return

    const onResizeDisposable = terminal.onResize((size: { cols: number; rows: number }) => {
      wsClient.send({
        type: 'resize',
        sessionId: session.id,
        cols: size.cols,
        rows: size.rows,
      })
    })

    const dims = getDimensions()
    if (dims) {
      wsClient.send({
        type: 'resize',
        sessionId: session.id,
        cols: dims.cols,
        rows: dims.rows,
      })
    }

    return () => {
      onResizeDisposable.dispose()
    }
  }, [terminal, wsClient, session.id, getDimensions])

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
  //
  // Android IME fix — Android keyboards (Gboard, Samsung, etc.) use IME
  // composition for ALL input, even single characters.  This causes:
  //
  //   1. Autocorrect replacements: After typing "didnt", autocorrect fires
  //      `insertReplacementText` to replace with "didn't" — but each
  //      original char was already sent.  Fix: cancel in `beforeinput`.
  //
  //   2. IME context buildup: the textarea accumulates text that the IME
  //      uses for prediction, causing re-processing of old text.
  //      Fix: clear textarea after xterm has processed each input.
  //
  //   3. Double-fire: compositionend + subsequent input event both cause
  //      xterm to emit onData with identical data within ~1-5ms.
  //      Fix: 50ms same-data dedup window.
  //
  // NOTE: We do NOT suppress onData during composition.  Android does
  // per-character micro-compositions (compositionstart → compositionend
  // for each keystroke).  xterm fires onData inside its own compositionend
  // handler which runs BEFORE any external listener — suppressing during
  // composition would swallow every character.
  useEffect(() => {
    if (!terminal || !nativeKeyboard) return

    const container = containerRef.current
    if (!container) return

    // Helper to get the current xterm textarea (may be recreated by xterm.js)
    const getTextarea = () => container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')

    // --- Layer 1: Cancel autocorrect replacements ---
    // Use container with capture phase so we catch events even if xterm
    // recreates the textarea after initial mount.
    const onBeforeInput = (e: Event) => {
      if (e instanceof InputEvent && e.inputType === 'insertReplacementText') {
        e.preventDefault()
      }
    }

    // --- Layer 2: Clear textarea to prevent IME context buildup ---
    // Track composition so we don't clear mid-composition (would break
    // xterm's CompositionHelper baseline tracking).
    let composing = false

    const onCompositionStart = () => {
      composing = true
    }
    const onCompositionEnd = () => {
      composing = false
      // Clear after composition to reset IME prediction context
      const ta = getTextarea()
      if (ta) {
        queueMicrotask(() => {
          ta.value = ''
        })
      }
    }
    const onInput = () => {
      if (!composing) {
        const ta = getTextarea()
        if (ta) {
          queueMicrotask(() => {
            ta.value = ''
          })
        }
      }
    }

    // Attach to container (capture phase) so listeners survive textarea recreation
    container.addEventListener('beforeinput', onBeforeInput, true)
    container.addEventListener('input', onInput, true)
    container.addEventListener('compositionstart', onCompositionStart, true)
    container.addEventListener('compositionend', onCompositionEnd, true)

    // --- Layer 3: Same-data dedup (safety net) ---
    let lastEmit = ''
    let lastEmitTime = 0
    const DEDUP_MS = 50

    const disposable = terminal.onData((data: string) => {
      const now = performance.now()
      if (data === lastEmit && now - lastEmitTime < DEDUP_MS) {
        return // duplicate from Android IME double-fire
      }
      lastEmit = data
      lastEmitTime = now
      handleKey(data)
    })

    return () => {
      disposable.dispose()
      container.removeEventListener('beforeinput', onBeforeInput, true)
      container.removeEventListener('input', onInput, true)
      container.removeEventListener('compositionstart', onCompositionStart, true)
      container.removeEventListener('compositionend', onCompositionEnd, true)
    }
  }, [terminal, nativeKeyboard, handleKey])

  const handleBack = useCallback(() => {
    onBack(captureScreen())
  }, [onBack, captureScreen])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
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
