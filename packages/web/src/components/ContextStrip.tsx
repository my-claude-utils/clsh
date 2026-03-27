import { useCallback } from 'react'
import type { ContextStripProps } from '../lib/types'

interface StripKey {
  label: string
  widthMultiplier: number
  data: string
  accent?: boolean
}

const STRIP_KEYS: StripKey[] = [
  { label: 'esc', widthMultiplier: 1.5, data: '\x1b', accent: true },
  { label: 'F1', widthMultiplier: 1, data: '\x1bOP' },
  { label: 'F2', widthMultiplier: 1, data: '\x1bOQ' },
  { label: 'F3', widthMultiplier: 1, data: '\x1bOR' },
  { label: 'F5', widthMultiplier: 1, data: '\x1b[15~' },
  { label: 'commit', widthMultiplier: 1.5, data: 'git commit\r' },
  { label: 'diff', widthMultiplier: 1.5, data: 'git diff\r' },
  { label: 'plan', widthMultiplier: 1.5, data: '/plan ' },
  { label: '====', widthMultiplier: 1.5, data: '\x03' },
  { label: '\u{1F4CB}', widthMultiplier: 1, data: '__CLIPBOARD__' },
]

const BASE_WIDTH = 36

export function ContextStrip({ onKey }: ContextStripProps) {
  const handleTouch = useCallback(
    (data: string) => (e: React.TouchEvent) => {
      e.preventDefault()
      onKey(data)
    },
    [onKey],
  )

  return (
    <div
      style={{
        height: 48,
        background: '#0d0d0d',
        borderTop: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {STRIP_KEYS.map((key) => (
        <button
          key={key.label}
          onTouchStart={handleTouch(key.data)}
          onMouseDown={(e) => {
            e.preventDefault()
            onKey(key.data)
          }}
          style={{
            height: 28,
            width: BASE_WIDTH * key.widthMultiplier,
            flexShrink: 0,
            background: key.accent ? 'rgba(255, 95, 87, 0.2)' : '#161616',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            color: key.accent ? '#ff5f57' : '#666',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            cursor: 'pointer',
            padding: 0,
            touchAction: 'manipulation',
            userSelect: 'none',
          }}
        >
          {key.label}
        </button>
      ))}
    </div>
  )
}
