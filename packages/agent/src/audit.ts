/**
 * Structured audit logger for security-relevant events.
 * Writes JSON lines to stderr (separate from application stdout).
 */
export function auditLog(event: string, data: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    data,
  }
  process.stderr.write(JSON.stringify(entry) + '\n')
}
