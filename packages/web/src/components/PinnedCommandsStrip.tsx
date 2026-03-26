import { useState, useCallback, useRef } from 'react'

export interface PinnedCommand {
  label: string
  command: string
}

interface PinnedCommandsStripProps {
  commands: PinnedCommand[]
  onExecute: (command: string) => void
}

export function PinnedCommandsStrip({ commands, onExecute }: PinnedCommandsStripProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  if (commands.length === 0) return null

  const handleTouchStart = useCallback((idx: number, command: string) => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      void navigator.clipboard.writeText(command).then(() => {
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 1500)
      })
    }, 500)
  }, [])

  const handleTouchEnd = useCallback(
    (command: string) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      if (!didLongPress.current) {
        onExecute(command + '\r')
      }
    },
    [onExecute],
  )

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  return (
    <div
      style={{
        height: 36,
        background: '#0d0d0d',
        borderTop: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {commands.map((cmd, idx) => (
        <button
          key={`${cmd.label}-${idx}`}
          onTouchStart={() => handleTouchStart(idx, cmd.command)}
          onTouchEnd={() => handleTouchEnd(cmd.command)}
          onTouchCancel={handleTouchCancel}
          onMouseDown={(e) => {
            e.preventDefault()
            onExecute(cmd.command + '\r')
          }}
          style={{
            height: 24,
            padding: '0 10px',
            flexShrink: 0,
            background: copiedIdx === idx ? 'rgba(40, 200, 64, 0.15)' : 'rgba(249, 115, 22, 0.08)',
            border: `1px solid ${copiedIdx === idx ? '#28c840' : 'rgba(249, 115, 22, 0.25)'}`,
            borderRadius: 12,
            color: copiedIdx === idx ? '#28c840' : '#f97316',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            fontWeight: 500,
            cursor: 'pointer',
            touchAction: 'manipulation',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {copiedIdx === idx ? 'Copied!' : cmd.label}
        </button>
      ))}
    </div>
  )
}
