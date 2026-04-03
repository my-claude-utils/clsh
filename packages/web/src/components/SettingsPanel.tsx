import { useState, useCallback } from 'react'
import { TERMINAL_THEMES, TERMINAL_THEME_ORDER, type TerminalThemeId } from '../lib/theme'

interface SettingsPanelProps {
  onClose: () => void
  onOpenSkinStudio: () => void
  sessionCount: number
  themeId: TerminalThemeId
  onThemeChange: (id: TerminalThemeId) => void
}

interface QuickCommand {
  label: string
  icon: string
  description: string
  action: () => void
}

export function SettingsPanel({
  onClose,
  onOpenSkinStudio,
  sessionCount,
  themeId,
  onThemeChange,
}: SettingsPanelProps) {
  const [showShareQR, setShowShareQR] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const quickCommands: QuickCommand[] = [
    {
      label: 'Keyboard Skins',
      icon: '\u{1F3A8}',
      description: 'Customize your keyboard look',
      action: () => {
        onClose()
        onOpenSkinStudio()
      },
    },
    {
      label: 'Share Access',
      icon: '\u{1F517}',
      description: 'Copy URL for another device',
      action: () => setShowShareQR(true),
    },
    {
      label: 'Screenshot Tip',
      icon: '\u{1F4F8}',
      description: 'How to capture your terminal',
      action: () => {
        alert('Use Power + Volume Up to screenshot your terminal — it looks awesome in dark mode!')
      },
    },
  ]

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#111',
          borderTop: '1px solid #2a2a2a',
          borderRadius: '16px 16px 0 0',
          padding: '16px 16px 32px',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center" style={{ marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, background: '#333', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316', letterSpacing: '0.1em' }}>
            SETTINGS
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#555',
              fontSize: 16,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-3" style={{ marginBottom: 16 }}>
          <div
            style={{
              flex: 1,
              background: '#161616',
              border: '1px solid #222',
              borderRadius: 8,
              padding: '8px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{sessionCount}</div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>SESSIONS</div>
          </div>
          <div
            style={{
              flex: 1,
              background: '#161616',
              border: '1px solid #222',
              borderRadius: 8,
              padding: '8px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: '#28c840' }}>&#x25CF;</div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>CONNECTED</div>
          </div>
          <div
            style={{
              flex: 1,
              background: '#161616',
              border: '1px solid #222',
              borderRadius: 8,
              padding: '8px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ccc' }}>v0.1</div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>VERSION</div>
          </div>
        </div>

        {/* Terminal Theme */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: '#555',
              marginBottom: 8,
              letterSpacing: '0.08em',
            }}
          >
            TERMINAL THEME
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TERMINAL_THEME_ORDER.map((id) => {
              const def = TERMINAL_THEMES[id]
              const isActive = id === themeId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onThemeChange(id)}
                  style={{
                    width: 'calc(50% - 4px)',
                    padding: '8px 10px',
                    background: def.theme.background,
                    border: isActive ? '2px solid #f97316' : '1px solid #333',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                    {[
                      def.theme.red,
                      def.theme.green,
                      def.theme.yellow,
                      def.theme.blue,
                      def.theme.magenta,
                      def.theme.cyan,
                    ].map((c, i) => (
                      <div
                        key={i}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: c as string,
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: def.theme.foreground as string,
                      fontWeight: 600,
                    }}
                  >
                    {def.name}
                  </div>
                  <div style={{ fontSize: 9, color: '#666' }}>{def.subtitle}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Quick commands */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quickCommands.map((cmd) => (
            <button
              key={cmd.label}
              type="button"
              onClick={cmd.action}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '10px 12px',
                background: '#161616',
                border: '1px solid #222',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 20 }}>{cmd.icon}</span>
              <div>
                <div style={{ fontSize: 12, color: '#ccc', fontWeight: 600 }}>{cmd.label}</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Share QR overlay */}
        {showShareQR && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 110,
            }}
            onClick={() => setShowShareQR(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
                maxWidth: 300,
              }}
            >
              <div style={{ fontSize: 12, color: '#ccc', marginBottom: 12 }}>
                Share this URL to connect from another device:
              </div>
              <div
                style={{
                  background: '#060606',
                  border: '1px solid #333',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 11,
                  color: '#f97316',
                  wordBreak: 'break-all',
                  marginBottom: 12,
                }}
              >
                {window.location.href}
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                style={{
                  background: copied ? 'rgba(40,200,64,0.2)' : 'rgba(249,115,22,0.15)',
                  border: `1px solid ${copied ? '#28c840' : '#f97316'}`,
                  borderRadius: 6,
                  color: copied ? '#28c840' : '#f97316',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 9, color: '#333' }}>clsh v0.1.0 — your mac, in your pocket</span>
        </div>
      </div>
    </div>
  )
}
