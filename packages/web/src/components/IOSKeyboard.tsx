/**
 * iOS-style terminal keyboard — bigger letter keys, special chars on a dedicated row.
 *
 * Layout:
 *   Row 1 (30px): ` 1 2 3 4 5 6 7 8 9 0 - =          (13 number keys)
 *   Row 2 (38px): q w e r t y u i o p                  (10 letter keys)
 *   Row 3 (38px):   a s d f g h j k l                  (9 letter keys, centered)
 *   Row 4 (38px): ⇧ z x c v b n m ⌫                  (shift + 7 letters + backspace)
 *   Row 5 (30px): tab caps [ ] ; ' , . / \ | ⏎         (12 special terminal keys)
 *   Row 6 (30px): fn ctrl opt cmd [space] ← ↑↓ →       (modifiers + arrows)
 */

import { useKeyboardState } from '../hooks/useKeyboardState'
import type { KeyDef } from '../hooks/useKeyboardState'
import type { MacBookKeyboardProps } from '../lib/types'
import { NUMBER_ROW } from '../lib/keyboard-rows'

// ── Row definitions ──────────────────────────────────────────────────────────

const ROW_1 = NUMBER_ROW

const ROW_2: KeyDef[] = [
  { id: 'q', label: 'q', width: 1 },
  { id: 'w', label: 'w', width: 1 },
  { id: 'e', label: 'e', width: 1 },
  { id: 'r', label: 'r', width: 1 },
  { id: 't', label: 't', width: 1 },
  { id: 'y', label: 'y', width: 1 },
  { id: 'u', label: 'u', width: 1 },
  { id: 'i', label: 'i', width: 1 },
  { id: 'o', label: 'o', width: 1 },
  { id: 'p', label: 'p', width: 1 },
]

const ROW_3: KeyDef[] = [
  { id: 'a', label: 'a', width: 1 },
  { id: 's', label: 's', width: 1 },
  { id: 'd', label: 'd', width: 1 },
  { id: 'f', label: 'f', width: 1 },
  { id: 'g', label: 'g', width: 1 },
  { id: 'h', label: 'h', width: 1 },
  { id: 'j', label: 'j', width: 1 },
  { id: 'k', label: 'k', width: 1 },
  { id: 'l', label: 'l', width: 1 },
]

const ROW_4: KeyDef[] = [
  { id: 'shift-left', label: '\u21E7', width: 1.5 },
  { id: 'z', label: 'z', width: 1 },
  { id: 'x', label: 'x', width: 1 },
  { id: 'c', label: 'c', width: 1 },
  { id: 'v', label: 'v', width: 1 },
  { id: 'b', label: 'b', width: 1 },
  { id: 'n', label: 'n', width: 1 },
  { id: 'm', label: 'm', width: 1 },
  { id: 'backspace', label: '\u232B', width: 1.5 },
]

const ROW_5: KeyDef[] = [
  { id: 'opt-left', label: 'opt', width: 1.1 },
  { id: 'cmd-left', label: '\u2318', width: 1.6 },
  { id: 'space', label: '', width: 5.5 },
  // arrow cluster + return rendered separately
]

const ROW_6: KeyDef[] = [
  { id: 'tab', label: 'tab', width: 1 },
  { id: 'caps', label: 'caps', width: 1 },
  { id: 'ctrl', label: 'ctrl', width: 1 },
  { id: '[', label: '[', shiftLabel: '{', width: 1 },
  { id: ']', label: ']', shiftLabel: '}', width: 1 },
  { id: ';', label: ';', shiftLabel: ':', width: 1 },
  { id: "'", label: "'", shiftLabel: '"', width: 1 },
  { id: ',', label: ',', shiftLabel: '<', width: 1 },
  { id: '.', label: '.', shiftLabel: '>', width: 1 },
  { id: '/', label: '/', shiftLabel: '?', width: 1 },
  { id: '\\', label: '\\', width: 1 },
  { id: '|', label: '|', width: 1 },
]

const ARROW_LEFT: KeyDef = { id: 'arrow-left', label: '\u2190', width: 0.9 }
const ARROW_RIGHT: KeyDef = { id: 'arrow-right', label: '\u2192', width: 0.9 }
const ARROW_UP: KeyDef = { id: 'arrow-up', label: '\u2191', width: 0.9 }
const ARROW_DOWN: KeyDef = { id: 'arrow-down', label: '\u2193', width: 0.9 }

const KEY_GAP = 5
const LETTER_ROW_HEIGHT = 38
const SMALL_ROW_HEIGHT = 30
const HALF_KEY_HEIGHT = (SMALL_ROW_HEIGHT - KEY_GAP) / 2

// Helper to check if a key ID is a letter
function isLetterKey(id: string): boolean {
  return id.length === 1 && id >= 'a' && id <= 'z'
}

export function IOSKeyboard({ onKey, perKeyColors }: MacBookKeyboardProps) {
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

  const renderKey = (keyDef: KeyDef, height: number, fontSize: number, isLetter: boolean) => {
    const isPressed = pressedKeys.has(keyDef.id)
    const isActive = isModifierActive(keyDef.id)
    const isFlashing = flashingKeys.has(keyDef.id)
    const perKeyColor = perKeyColors[keyDef.id]

    // iOS behavior: letters show lowercase by default, uppercase when shifted
    let displayLabel = keyDef.label
    if (isLetter) {
      displayLabel = isShifted ? keyDef.label.toUpperCase() : keyDef.label.toLowerCase()
    }

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
              (isActive ? 'var(--key-active, #1c1c1e)' : 'var(--key-face, #2c2c2e)')),
          border: `1px solid ${isActive || isFlashing ? '#f97316' : 'var(--key-border, #3a3a3c)'}`,
          borderRadius: 8,
          boxShadow: isPressed
            ? '0 1px 0 var(--key-side, #161618), 0 1px 2px rgba(0,0,0,0.3)'
            : '0 2px 0 var(--key-side, #161618), 0 2px 3px rgba(0,0,0,0.3)',
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
        {/* Shift label (top-left) — only for non-letter small keys */}
        {keyDef.shiftLabel && !isLetter && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 4,
              fontSize: 7,
              color: isShifted ? '#f97316' : 'var(--key-label-shift, #8e8e93)',
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
            fontSize,
            color: isFlashing ? '#060606' : isActive ? '#f97316' : 'var(--key-label, #ffffff)',
            fontFamily: '"JetBrains Mono", monospace',
            lineHeight: 1,
            pointerEvents: 'none',
            fontWeight: isLetter ? 400 : undefined,
          }}
        >
          {displayLabel}
        </span>
      </div>
    )
  }

  const renderRow = (
    keys: KeyDef[],
    height: number,
    fontSize: number,
    opts?: { centered?: boolean; arrowCluster?: boolean },
  ) => (
    <div
      style={{
        display: 'flex',
        gap: KEY_GAP,
        marginBottom: KEY_GAP,
        width: '100%',
      }}
    >
      {/* Centering spacer for row 3 */}
      {opts?.centered && <div style={{ flex: 0.5, minWidth: 0 }} />}

      {keys.map((keyDef) => renderKey(keyDef, height, fontSize, isLetterKey(keyDef.id)))}

      {/* Centering spacer for row 3 */}
      {opts?.centered && <div style={{ flex: 0.5, minWidth: 0 }} />}

      {/* Arrow cluster: ← [↑/↓] → */}
      {opts?.arrowCluster && (
        <>
          {renderKey(ARROW_LEFT, height, 10, false)}
          <div
            style={{
              flex: ARROW_UP.width,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: KEY_GAP,
              height,
            }}
          >
            {renderKey(ARROW_UP, HALF_KEY_HEIGHT, 10, false)}
            {renderKey(ARROW_DOWN, HALF_KEY_HEIGHT, 10, false)}
          </div>
          {renderKey(ARROW_RIGHT, height, 10, false)}
          {renderKey({ id: 'return', label: '\u23CE', width: 2 }, height, 10, false)}
        </>
      )}
    </div>
  )

  return (
    <div
      data-kbd=""
      style={{
        background: 'var(--kbd-bg, #1b1b1d)',
        padding: 8,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        flexShrink: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Row 1: numbers (30px, 10px font) */}
      {renderRow(ROW_1, SMALL_ROW_HEIGHT, 10)}
      {/* Row 2: QWERTY (38px, 16px font) */}
      {renderRow(ROW_2, LETTER_ROW_HEIGHT, 16)}
      {/* Row 3: ASDF centered (38px, 16px font) */}
      {renderRow(ROW_3, LETTER_ROW_HEIGHT, 16, { centered: true })}
      {/* Row 4: shift + ZXCV + backspace (38px, 16px font for letters, icon for shift/backspace) */}
      {renderRow(ROW_4, LETTER_ROW_HEIGHT, 16)}
      {/* Row 5: modifiers + space + return + arrows (30px, 10px font) */}
      {renderRow(ROW_5, SMALL_ROW_HEIGHT, 10, { arrowCluster: true })}
      {/* Row 6: special terminal keys (30px, 10px font) — last row, no marginBottom */}
      <div
        style={{
          display: 'flex',
          gap: KEY_GAP,
          width: '100%',
        }}
      >
        {ROW_6.map((keyDef) => renderKey(keyDef, SMALL_ROW_HEIGHT, 10, false))}
      </div>
    </div>
  )
}
