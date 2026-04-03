/**
 * Formats a timestamp as a relative time string.
 * Returns "just now", "2m ago", "1h ago", "3d ago", etc.
 */
export function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return 'just now'

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(diff / 86_400_000)
  return `${days}d ago`
}
