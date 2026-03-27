/**
 * Compact accessory bar for use with the native phone keyboard.
 *
 * Shows only the terminal-specific keys that a phone keyboard lacks:
 * Esc, Tab, Ctrl (sticky toggle), arrow keys, pipe, tilde, Ctrl+C/D/Z.
 *
 * Single row, horizontally scrollable, sits above the native keyboard.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

interface AccessoryKey {
  id: string
  label: string
  /** Escape sequence to send, or empty string for modifiers. */
  data: string
  /** If true, acts as a sticky toggle (like Ctrl). */
  isModifier?: boolean
  /** Slightly wider key. */
  wide?: boolean
}

const KEYS: AccessoryKey[] = [
  { id: 'esc', label: 'esc', data: '\x1b' },
  { id: 'tab', label: 'tab', data: '\t' },
  { id: 'ctrl', label: 'ctrl', data: '', isModifier: true },
  { id: 'arrow-up', label: '\u2191', data: '\x1b[A' },
  { id: 'arrow-down', label: '\u2193', data: '\x1b[B' },
  { id: 'arrow-left', label: '\u2190', data: '\x1b[D' },
  { id: 'arrow-right', label: '\u2192', data: '\x1b[C' },
  { id: 'pipe', label: '|', data: '|' },
  { id: 'tilde', label: '~', data: '~' },
  { id: 'backtick', label: '`', data: '`' },
  { id: 'ctrl-c', label: '^C', data: '\x03', wide: true },
  { id: 'ctrl-d', label: '^D', data: '\x04', wide: true },
  { id: 'ctrl-z', label: '^Z', data: '\x1a', wide: true },
  { id: 'ctrl-l', label: '^L', data: '\x0c', wide: true },
]

const REPEAT_DELAY = 400
const REPEAT_INTERVAL = 60

export function TerminalAccessoryBar({ onKey }: { onKey: (data: string) => void }) {
  const [ctrlActive, setCtrlActive] = useState(false)
  const [pressedId, setPressedId] = useState<string | null>(null)

  // Key repeat
  const repeatDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isTouchRef = useRef(false)

  const stopRepeat = useCallback(() => {
    if (repeatDelayRef.current) {
      clearTimeout(repeatDelayRef.current)
      repeatDelayRef.current = null
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }, [])

  useEffect(() => stopRepeat, [stopRepeat])

  const emitKey = useCallback(
    (key: AccessoryKey) => {
      if (key.isModifier) {
        setCtrlActive((prev) => !prev)
        return
      }

      onKey(key.data)

      if (ctrlActive) setCtrlActive(false)
    },
    [onKey, ctrlActive],
  )

  const startRepeat = useCallback(
    (key: AccessoryKey) => {
      if (key.isModifier || !key.data) return
      stopRepeat()
      repeatDelayRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          onKey(key.data)
        }, REPEAT_INTERVAL)
      }, REPEAT_DELAY)
    },
    [onKey, stopRepeat],
  )

  const handleDown = useCallback(
    (key: AccessoryKey, isTouch: boolean) => {
      if (isTouch) isTouchRef.current = true
      setPressedId(key.id)
      emitKey(key)
      if (!key.isModifier) startRepeat(key)
    },
    [emitKey, startRepeat],
  )

  const handleUp = useCallback(() => {
    setPressedId(null)
    stopRepeat()
  }, [stopRepeat])

  return (
    <div
      style={{
        height: 44,
        background: '#0d0d0d',
        borderTop: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '0 6px',
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {KEYS.map((key) => {
        const isActive = key.id === 'ctrl' && ctrlActive
        const isPressed = pressedId === key.id

        return (
          <button
            key={key.id}
            onTouchStart={(e) => {
              e.preventDefault()
              handleDown(key, true)
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              handleUp()
            }}
            onTouchCancel={() => handleUp()}
            onMouseDown={(e) => {
              if (isTouchRef.current) {
                isTouchRef.current = false
                return
              }
              e.preventDefault()
              handleDown(key, false)
            }}
            onMouseUp={() => handleUp()}
            onMouseLeave={() => handleUp()}
            style={{
              height: 32,
              minWidth: key.wide ? 40 : 34,
              padding: '0 8px',
              flexShrink: 0,
              background: isActive
                ? 'rgba(249, 115, 22, 0.25)'
                : isPressed
                  ? '#252525'
                  : '#161616',
              border: `1px solid ${isActive ? '#f97316' : '#2a2a2a'}`,
              borderRadius: 6,
              color: isActive ? '#f97316' : '#999',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              touchAction: 'manipulation',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              transform: isPressed ? 'translateY(1px)' : 'none',
              transition: 'background 0.1s',
            }}
          >
            {key.label}
          </button>
        )
      })}
    </div>
  )
}
