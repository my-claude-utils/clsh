import { execSync } from 'node:child_process'
import { ORANGE, DIM, RESET } from './ansi.js'

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

  console.log(`${ORANGE}  Tip:${RESET} Wi-Fi may drop when you close the lid.`)
  console.log(`${DIM}  Run once to fix:${RESET} sudo pmset -c tcpkeepalive 1`)
}
