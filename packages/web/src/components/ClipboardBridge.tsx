import { useState, useCallback, useEffect, useRef } from 'react'

interface ClipboardBridgeProps {
  /** Raw ANSI output chunks for the current session */
  getOutput: () => string[]
  /** Whether the terminal view is active */
  visible: boolean
}

/** Strip ANSI escape sequences from a string. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(
    /\x1b(?:\][\s\S]*?(?:\x07|\x1b\\)|\[[?!>]*[\d;]*[A-Za-z]|[()][AB012]|\x1b)/g,
    '',
  )
}

/** Extract the last output block (everything since the last user prompt). */
function extractLastOutput(chunks: string[]): string {
  // Join all chunks and strip ANSI
  const full = stripAnsi(chunks.join(''))
  // Split into lines and find the last block after a prompt-like pattern
  const lines = full.split('\n')

  // Work backwards to find the start of the last output block
  let blockStart = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    // Detect shell/claude prompts — including Claude Code's box-drawing prompt
    if (
      /^\$\s/.test(line) ||
      /^>\s*$/.test(line) ||
      /^❯\s/.test(line) ||
      /^%\s/.test(line) ||
      /^\w+@[\w-]+:/.test(line) ||
      /^╭─/.test(line) || // Claude Code prompt box top
      /^╰─/.test(line) || // Claude Code prompt box bottom
      /^\s*\$\s/.test(line) || // indented shell prompt
      /^~\//.test(line) // home-relative path prompt (zsh)
    ) {
      blockStart = i + 1
      break
    }
  }

  return lines.slice(blockStart).join('\n').trim()
}

/** Detect copyable blocks in the output (code blocks, URLs, file paths). */
function detectCopyableBlocks(chunks: string[]): string[] {
  const full = stripAnsi(chunks.join(''))
  const blocks: string[] = []

  // Detect URLs
  const urlRegex = /https?:\/\/[^\s)>\]]+/g
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(full)) !== null) {
    blocks.push(match[0])
  }

  // Detect file paths
  const pathRegex = /(?:^|\s)(\/[\w./-]+\.\w+)/gm
  while ((match = pathRegex.exec(full)) !== null) {
    blocks.push(match[1])
  }

  // Deduplicate and return most recent first
  return [...new Set(blocks)].reverse().slice(0, 10)
}

export function ClipboardBridge({ getOutput, visible }: ClipboardBridgeProps) {
  const [toast, setToast] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<string[]>([])
  const [blockIdx, setBlockIdx] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Periodically update detected blocks
  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => {
      const output = getOutput()
      if (output.length > 0) {
        setBlocks(detectCopyableBlocks(output))
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [visible, getOutput])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1500)
  }, [])

  const copyLastOutput = useCallback(() => {
    const output = getOutput()
    if (output.length === 0) return
    const text = extractLastOutput(output)
    if (!text) {
      showToast('Nothing to copy')
      return
    }
    void navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
  }, [getOutput, showToast])

  const copyBlock = useCallback(() => {
    if (blocks.length === 0) return
    const text = blocks[blockIdx % blocks.length]
    void navigator.clipboard.writeText(text).then(() => {
      showToast('Copied!')
      setBlockIdx((i) => (i + 1) % blocks.length)
    })
  }, [blocks, blockIdx, showToast])

  if (!visible) return null

  // Determine what the button does: copy specific block if detected, or copy last output
  const hasBlocks = blocks.length > 0
  const handleCopyTap = hasBlocks ? copyBlock : copyLastOutput

  return (
    <>
      {/* Floating copy button — positioned absolutely in the terminal area, above the keyboard stack.
       *  Uses absolute positioning relative to the flex parent instead of fixed bottom
       *  to avoid being hidden behind the keyboard. */}
      <button
        type="button"
        onClick={handleCopyTap}
        style={{
          position: 'absolute',
          top: 52,
          right: 8,
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'rgba(249, 115, 22, 0.12)',
          border: '1px solid rgba(249, 115, 22, 0.3)',
          color: '#f97316',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 40,
          opacity: 0.7,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.7'
        }}
      >
        {hasBlocks && blocks.length > 1 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#f97316',
              color: '#000',
              fontSize: 8,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {blocks.length}
          </span>
        )}
        &#x1F4CB;
      </button>

      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 88,
            right: 8,
            padding: '3px 10px',
            borderRadius: 6,
            background: 'rgba(40, 200, 64, 0.2)',
            border: '1px solid rgba(40, 200, 64, 0.4)',
            color: '#28c840',
            fontSize: 10,
            fontFamily: '"JetBrains Mono", monospace',
            zIndex: 41,
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}

export { extractLastOutput, stripAnsi as stripAnsiForClipboard }
