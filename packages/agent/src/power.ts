import { execSync } from 'node:child_process'

/**
 * Checks if macOS is configured to keep network alive when the lid closes.
 * Prints a one-time hint if not configured. Never modifies system settings.
 *
 * The key setting is `tcpkeepalive 1` which keeps TCP connections (like the
 * ngrok tunnel) alive during display sleep / lid close.
 */
export function checkNetworkPersistence(): void {
  if (process.platform !== 'darwin') return

  try {
    const output = execSync('pmset -g', { encoding: 'utf-8' })
    const tcpMatch = /tcpkeepalive\s+(\d+)/.exec(output)
    if (tcpMatch?.[1] === '1') {
      return // Already configured, stay silent
    }
  } catch {
    return // Can't read pmset, skip silently
  }

  // ANSI colors matching the clsh startup style
  const o = '\x1b[38;5;208m' // orange
  const dim = '\x1b[2m'
  const r = '\x1b[0m'

  console.log(`${o}  Tip:${r} Wi-Fi may drop when you close the lid.`)
  console.log(`${dim}  Run once to fix:${r} sudo pmset -c tcpkeepalive 1`)
}
