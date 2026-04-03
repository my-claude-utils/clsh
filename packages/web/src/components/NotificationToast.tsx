/**
 * In-app notification toast overlay.
 * Renders a stack of notification banners at the top of the screen.
 * Mobile-first, touch to dismiss, slide-in animation.
 */

import type { InAppNotification, TriggerType } from '../hooks/useNotifications'

interface NotificationToastProps {
  notifications: InAppNotification[]
  onDismiss: (id: string) => void
}

const TRIGGER_STYLES: Record<TriggerType, { border: string; icon: string; color: string }> = {
  permission: { border: '#f97316', icon: '\u26a0', color: '#f97316' },
  error: { border: '#ef4444', icon: '\u2717', color: '#ef4444' },
  completion: { border: '#28c840', icon: '\u2713', color: '#28c840' },
  session: { border: '#666', icon: '\u24d8', color: '#999' },
  custom: { border: '#f97316', icon: '\u25c8', color: '#f97316' },
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  if (notifications.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 8px)',
        left: 16,
        right: 16,
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        maxWidth: 400,
        margin: '0 auto',
      }}
    >
      {notifications.map((notif) => {
        const style = TRIGGER_STYLES[notif.trigger]
        return (
          <div
            key={notif.id}
            onClick={() => onDismiss(notif.id)}
            style={{
              pointerEvents: 'auto',
              background: '#111',
              borderLeft: `3px solid ${style.border}`,
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'JetBrains Mono, monospace',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              animation: 'toast-slide-in 0.25s ease-out',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 2,
              }}
            >
              <span style={{ fontSize: 13, color: style.color }}>{style.icon}</span>
              <span style={{ fontSize: 11, color: style.color, fontWeight: 700 }}>
                {notif.label}
              </span>
              <span style={{ fontSize: 9, color: '#555', marginLeft: 'auto' }}>
                {notif.sessionName}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#999',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {notif.matched.slice(0, 120)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
