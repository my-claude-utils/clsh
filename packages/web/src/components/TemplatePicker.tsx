import { useState, useEffect } from 'react'

export interface SessionTemplate {
  name: string
  directory: string
  shell: 'bash' | 'zsh' | 'claude'
  icon: string
}

interface TemplatePickerProps {
  onSelect: (template: SessionTemplate | null) => void
  onCancel: () => void
}

export function TemplatePicker({ onSelect, onCancel }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/templates')
        if (res.ok) {
          const data = (await res.json()) as { templates: SessionTemplate[] }
          setTemplates(data.templates)
        }
      } catch {
        // Failed to load templates — show blank session option only
      }
      setLoading(false)
    })()
  }, [])

  // If no templates configured, skip picker and create blank session
  useEffect(() => {
    if (!loading && templates.length === 0) {
      onSelect(null)
    }
  }, [loading, templates.length, onSelect])

  if (loading || templates.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(6, 6, 6, 0.9)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: 360,
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: '#888',
            marginBottom: 12,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          New Session
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {templates.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelect(t)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 8px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#f97316'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2a2a2a'
              }}
            >
              <span style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</span>
              <span
                style={{
                  fontSize: 11,
                  color: '#ccc',
                  fontFamily: 'JetBrains Mono, monospace',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                {t.name}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: '#666',
                  fontFamily: 'JetBrains Mono, monospace',
                  marginTop: 2,
                }}
              >
                {t.shell}
              </span>
            </button>
          ))}

          {/* Blank session */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 8px',
              background: 'transparent',
              border: '1px dashed #333',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 24, color: '#555', marginBottom: 6 }}>+</span>
            <span
              style={{
                fontSize: 11,
                color: '#666',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Blank
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
