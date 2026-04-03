/**
 * Parses tmux control mode (-CC) protocol output.
 *
 * In control mode, tmux sends structured text notifications instead of screen
 * redraws. The key notification is %output, which contains the RAW pane output
 * (octal-encoded), giving us both tmux persistence and proper xterm.js scrollback.
 *
 * Protocol format:
 *   %output %<paneId> <octal-encoded data>
 *   %begin <timestamp> <cmdNumber> <flags>
 *   %end <timestamp> <cmdNumber> <flags>
 *   %error <timestamp> <cmdNumber> <flags>
 *   %exit
 *   %session-changed $<id> <name>
 */

/** Parsed control mode events. */
export type ControlModeEvent =
  | { type: 'output'; paneId: string; data: string }
  | { type: 'begin'; timestamp: number; cmdNumber: number }
  | { type: 'end'; timestamp: number; cmdNumber: number }
  | { type: 'error'; timestamp: number; cmdNumber: number }
  | { type: 'exit' }

/**
 * Decodes tmux octal-encoded string.
 * tmux encodes characters < ASCII 32 and backslash as \NNN (3 octal digits).
 * E.g. \033 → ESC (0x1B), \015 → CR, \012 → LF, \134 → backslash.
 */
export function decodeTmuxOctal(encoded: string): string {
  return encoded.replace(/\\(\d{3})/g, (_match: string, oct: string) =>
    String.fromCharCode(parseInt(oct, 8)),
  )
}

/**
 * Encodes raw input bytes as hex for tmux `send-keys -H`.
 * Each character becomes a 2-digit hex value separated by spaces.
 */
export function encodeInputAsHex(data: string): string {
  const parts: string[] = []
  for (let i = 0; i < data.length; i++) {
    parts.push(data.charCodeAt(i).toString(16).padStart(2, '0'))
  }
  return parts.join(' ')
}

/**
 * Parses a single line of tmux control mode output.
 * Returns null for non-event lines (DCS sequences, empty lines, etc).
 */
export function parseControlLine(line: string): ControlModeEvent | null {
  if (!line.startsWith('%')) return null

  if (line.startsWith('%output ')) {
    // Format: %output %<paneId> <octal-encoded data>
    const rest = line.substring(8)
    const spaceIdx = rest.indexOf(' ')
    if (spaceIdx === -1) return null
    const paneId = rest.substring(0, spaceIdx)
    const data = decodeTmuxOctal(rest.substring(spaceIdx + 1))
    return { type: 'output', paneId, data }
  }

  if (line.startsWith('%begin ')) {
    const parts = line.split(' ')
    return { type: 'begin', timestamp: parseInt(parts[1], 10), cmdNumber: parseInt(parts[2], 10) }
  }

  if (line.startsWith('%end ')) {
    const parts = line.split(' ')
    return { type: 'end', timestamp: parseInt(parts[1], 10), cmdNumber: parseInt(parts[2], 10) }
  }

  if (line.startsWith('%error ')) {
    const parts = line.split(' ')
    return { type: 'error', timestamp: parseInt(parts[1], 10), cmdNumber: parseInt(parts[2], 10) }
  }

  if (line === '%exit') {
    return { type: 'exit' }
  }

  // Other notifications (%session-changed, %window-add, etc) — ignore
  return null
}

/** Max input bytes per send-keys -H command to avoid overly long commands. */
const MAX_HEX_CHUNK = 512

/**
 * Builds tmux send-keys -H commands for forwarding user input.
 * Chunks large inputs to keep command length reasonable.
 */
export function buildSendKeysCommands(tmuxName: string, data: string): string[] {
  const commands: string[] = []

  for (let offset = 0; offset < data.length; offset += MAX_HEX_CHUNK) {
    const chunk = data.substring(offset, offset + MAX_HEX_CHUNK)
    const hex = encodeInputAsHex(chunk)
    commands.push(`send-keys -t ${tmuxName} -H ${hex}`)
  }

  return commands
}

/**
 * Line-buffered parser for tmux control mode PTY output.
 * Accumulates raw pty.onData() chunks into complete lines, then parses each.
 */
export class ControlModeLineBuffer {
  private buffer = ''
  private callback: (event: ControlModeEvent) => void

  constructor(callback: (event: ControlModeEvent) => void) {
    this.callback = callback
  }

  /** Feed raw data from pty.onData(). Parses complete lines and emits events. */
  feed(data: string): void {
    this.buffer += data

    let newlineIdx: number
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIdx).replace(/\r$/, '')
      this.buffer = this.buffer.substring(newlineIdx + 1)

      if (line === '') continue

      const event = parseControlLine(line)
      if (event) {
        this.callback(event)
      }
    }
  }
}
