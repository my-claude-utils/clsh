import { useKeyboardState } from '../hooks/useKeyboardState'
import type { KeyDef } from '../hooks/useKeyboardState'
import type { MacBookKeyboardProps } from '../lib/types'
import { NUMBER_ROW } from '../lib/keyboard-rows'

// ── Row definitions ──────────────────────────────────────────────────────────

const ROW_1 = [...NUMBER_ROW, { id: 'backspace', label: '\u232B', width: 2 }]

const ROW_2: KeyDef[] = [
  { id: 'tab', label: 'tab', width: 1.5 },
  { id: 'q', label: 'Q', width: 1 },
  { id: 'w', label: 'W', width: 1 },
  { id: 'e', label: 'E', width: 1 },
  { id: 'r', label: 'R', width: 1 },
  { id: 't', label: 'T', width: 1 },
  { id: 'y', label: 'Y', width: 1 },
  { id: 'u', label: 'U', width: 1 },
  { id: 'i', label: 'I', width: 1 },
  { id: 'o', label: 'O', width: 1 },
  { id: 'p', label: 'P', width: 1 },
  { id: '[', label: '[', shiftLabel: '{', width: 1 },
  { id: ']', label: ']', shiftLabel: '}', width: 1 },
  { id: '\\', label: '\\', shiftLabel: '|', width: 1 },
]

const ROW_3: KeyDef[] = [
  { id: 'caps', label: 'caps', width: 1.6 },
  { id: 'a', label: 'A', width: 1 },
  { id: 's', label: 'S', width: 1 },
  { id: 'd', label: 'D', width: 1 },
  { id: 'f', label: 'F', width: 1 },
  { id: 'g', label: 'G', width: 1 },
  { id: 'h', label: 'H', width: 1 },
  { id: 'j', label: 'J', width: 1 },
  { id: 'k', label: 'K', width: 1 },
  { id: 'l', label: 'L', width: 1 },
  { id: ';', label: ';', shiftLabel: ':', width: 1 },
  { id: "'", label: "'", shiftLabel: '"', width: 1 },
  { id: 'return', label: 'return', width: 2.3 },
]

const ROW_4: KeyDef[] = [
  { id: 'shift-left', label: '\u21E7', width: 2.2 },
  { id: 'z', label: 'Z', width: 1 },
  { id: 'x', label: 'X', width: 1 },
  { id: 'c', label: 'C', width: 1 },
  { id: 'v', label: 'V', width: 1 },
  { id: 'b', label: 'B', width: 1 },
  { id: 'n', label: 'N', width: 1 },
  { id: 'm', label: 'M', width: 1 },
  { id: ',', label: ',', shiftLabel: '<', width: 1 },
  { id: '.', label: '.', shiftLabel: '>', width: 1 },
  { id: '/', label: '/', shiftLabel: '?', width: 1 },
  { id: 'shift-right', label: '\u21E7', width: 2.6 },
]

// ROW_5: arrow-up / arrow-down are rendered as a special stacked cluster, not inline
const ROW_5: KeyDef[] = [
  { id: 'fn', label: 'fn', width: 1 },
  { id: 'ctrl', label: 'ctrl', width: 1.1 },
  { id: 'opt-left', label: 'opt', width: 1.1 },
  { id: 'cmd-left', label: '\u2318', width: 1.6 },
  { id: 'space', label: '', width: 5.5 },
  { id: 'cmd-right', label: '\u2318', width: 1.6 },
  { id: 'opt-right', label: 'opt', width: 1.1 },
  // arrow cluster is rendered separately
]

const ARROW_LEFT: KeyDef = { id: 'arrow-left', label: '\u2190', width: 0.9 }
const ARROW_RIGHT: KeyDef = { id: 'arrow-right', label: '\u2192', width: 0.9 }
const ARROW_UP: KeyDef = { id: 'arrow-up', label: '\u2191', width: 0.9 }
const ARROW_DOWN: KeyDef = { id: 'arrow-down', label: '\u2193', width: 0.9 }

const ALL_ROWS = [ROW_1, ROW_2, ROW_3, ROW_4, ROW_5]

const KEY_GAP = 3.5
const KEY_HEIGHT = 32
const HALF_KEY_HEIGHT = (KEY_HEIGHT - KEY_GAP) / 2

export function MacBookKeyboard({ onKey, perKeyColors }: MacBookKeyboardProps) {
  const {
    isShifted,
    pressedKeys,
    flashingKeys,
    isModifierActive,
    handleTouchStart,
    handleTouchEnd,
    handleMouseDown,
    handleMouseUp,
  } = useKeyboardState({ onKey })

  const renderKey = (keyDef: KeyDef, height: number = KEY_HEIGHT) => {
    const isPressed = pressedKeys.has(keyDef.id)
    const isActive = isModifierActive(keyDef.id)
    const isFlashing = flashingKeys.has(keyDef.id)
    const perKeyColor = perKeyColors[keyDef.id]

    return (
      <div
        key={keyDef.id}
        onTouchStart={handleTouchStart(keyDef)}
        onTouchEnd={handleTouchEnd(keyDef)}
        onTouchCancel={handleTouchEnd(keyDef)}
        onMouseDown={handleMouseDown(keyDef)}
        onMouseUp={handleMouseUp(keyDef)}
        onMouseLeave={handleMouseUp(keyDef)}
        style={{
          position: 'relative',
          flex: keyDef.width,
          minWidth: 0,
          height,
          background: isFlashing
            ? '#f97316'
            : (perKeyColor ??
              (isActive ? 'var(--key-active, #2a2a2e)' : 'var(--key-face, #1c1c1e)')),
          border: `1px solid ${isActive || isFlashing ? '#f97316' : 'var(--key-border, #303032)'}`,
          borderRadius: 4,
          boxShadow: isPressed
            ? '0 1px 0 var(--key-side, #0e0e0f), 0 1px 2px rgba(0,0,0,0.5)'
            : '0 2px 0 var(--key-side, #0e0e0f), 0 2px 4px rgba(0,0,0,0.5)',
          transform: isPressed ? 'translateY(1px)' : 'none',
          transition: 'background 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          touchAction: 'manipulation',
          padding: '0 2px',
          overflow: 'hidden',
        }}
      >
        {/* Shift label (top-left) */}
        {keyDef.shiftLabel && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 4,
              fontSize: 7,
              color: isShifted ? '#f97316' : 'var(--key-label-shift, #555)',
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: 1,
            }}
          >
            {keyDef.shiftLabel}
          </span>
        )}

        {/* Main label */}
        <span
          style={{
            fontSize: 9,
            color: isFlashing ? '#060606' : isActive ? '#f97316' : 'var(--key-label, #8a8a8e)',
            fontFamily: '"JetBrains Mono", monospace',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {keyDef.label}
        </span>
      </div>
    )
  }

  return (
    <div
      data-kbd=""
      style={{
        background: 'var(--kbd-bg, #141416)',
        padding: 8,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        flexShrink: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {ALL_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'flex',
            gap: KEY_GAP,
            marginBottom: rowIndex < ALL_ROWS.length - 1 ? KEY_GAP : 0,
            width: '100%',
          }}
        >
          {row.map((keyDef) => renderKey(keyDef))}

          {/* Arrow cluster on the last row: ← [↑/↓] → */}
          {rowIndex === ALL_ROWS.length - 1 && (
            <>
              {renderKey(ARROW_LEFT)}
              <div
                style={{
                  flex: ARROW_UP.width,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: KEY_GAP,
                  height: KEY_HEIGHT,
                }}
              >
                {renderKey(ARROW_UP, HALF_KEY_HEIGHT)}
                {renderKey(ARROW_DOWN, HALF_KEY_HEIGHT)}
              </div>
              {renderKey(ARROW_RIGHT)}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
