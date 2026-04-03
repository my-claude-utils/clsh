/**
 * Hook for receiving in-app notification toasts via the WebSocket message bus.
 * Manages a queue of active notifications with auto-dismiss timers.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { MessageBus } from '../lib/message-bus'
import type { TriggerType } from '@clsh/shared'

export type { TriggerType }

export interface InAppNotification {
  id: string
  sessionId: string
  sessionName: string
  trigger: TriggerType
  label: string
  matched: string
  timestamp: string
}

const MAX_VISIBLE = 5
const DEFAULT_DISMISS_MS = 5_000
const PERMISSION_DISMISS_MS = 10_000

let nextId = 0

export function useNotifications(messageBus: MessageBus | null) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  useEffect(() => {
    if (!messageBus) return

    const unsub = messageBus.subscribe((msg) => {
      if (msg.type !== 'notification') return

      const id = `notif-${String(++nextId)}`
      const notif: InAppNotification = {
        id,
        sessionId: msg.sessionId,
        sessionName: msg.sessionName,
        trigger: msg.trigger,
        label: msg.label,
        matched: msg.matched,
        timestamp: msg.timestamp,
      }

      setNotifications((prev) => {
        const next = [...prev, notif]
        // Evict oldest if over limit
        if (next.length > MAX_VISIBLE) {
          const evicted = next[0]
          const timer = timersRef.current.get(evicted.id)
          if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(evicted.id)
          }
          return next.slice(1)
        }
        return next
      })

      // Auto-dismiss timer
      const ms = notif.trigger === 'permission' ? PERMISSION_DISMISS_MS : DEFAULT_DISMISS_MS
      const timer = setTimeout(() => {
        timersRef.current.delete(id)
        setNotifications((prev) => prev.filter((n) => n.id !== id))
      }, ms)
      timersRef.current.set(id, timer)
    })

    return () => {
      unsub()
      // Clear all timers on unmount
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [messageBus])

  return { notifications, dismiss } as const
}
