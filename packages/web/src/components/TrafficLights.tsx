/**
 * macOS window traffic light buttons (close, minimize, maximize).
 * Purely decorative -- no click handlers.
 */
export function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#ff5f57' }} />
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#febc2e' }} />
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#28c840' }} />
    </div>
  )
}
