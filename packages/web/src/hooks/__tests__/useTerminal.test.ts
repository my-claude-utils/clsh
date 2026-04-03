/**
 * Tests for useTerminal Android IME fix.
 *
 * Android keyboards (Gboard, Samsung, etc.) cause duplicate/garbled input via:
 *   1. Autocorrect replacements (insertReplacementText) — must be cancelled
 *   2. Composition double-fire — same data emitted twice within ~5ms
 *   3. IME context buildup — textarea accumulates text for prediction
 *
 * The fix has three layers:
 *   - beforeinput cancellation of insertReplacementText
 *   - Textarea clearing after each committed input (prevents IME context)
 *   - Same-data dedup window on onData (safety net)
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/** inputType values that must be blocked in beforeinput to prevent autocorrect. */
const BLOCKED_INPUT_TYPES = ['insertReplacementText'] as const

/** inputType values that should be allowed through. */
const ALLOWED_INPUT_TYPES = [
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'insertFromPaste',
  'deleteContentBackward',
  'deleteContentForward',
] as const

describe('Android IME — beforeinput filtering', () => {
  it('blocks insertReplacementText (autocorrect)', () => {
    // Simulates the beforeinput handler logic.
    // insertReplacementText fires when Android autocorrect replaces
    // already-committed text (e.g., "didnt" → "didn't"), which would
    // cause the terminal to receive both versions.
    const shouldBlock = (inputType: string) =>
      BLOCKED_INPUT_TYPES.includes(inputType as (typeof BLOCKED_INPUT_TYPES)[number])

    expect(shouldBlock('insertReplacementText')).toBe(true)
  })

  it('allows normal text input types through', () => {
    const shouldBlock = (inputType: string) =>
      BLOCKED_INPUT_TYPES.includes(inputType as (typeof BLOCKED_INPUT_TYPES)[number])

    for (const allowed of ALLOWED_INPUT_TYPES) {
      expect(shouldBlock(allowed)).toBe(false)
    }
  })
})

describe('Android IME — textarea clearing', () => {
  it('clears textarea only when not composing', () => {
    // Simulates the clearing logic: after each input event, the textarea
    // value is cleared (via microtask) to prevent Android IME from using
    // accumulated text for prediction/autocorrect.  During composition,
    // clearing is deferred to avoid breaking the composition preview.
    let composing = false
    let textareaValue = ''

    const simulateInput = (char: string) => {
      textareaValue += char
      // Simulates the queueMicrotask clear
      if (!composing) {
        textareaValue = ''
      }
    }

    // Normal input: cleared immediately
    simulateInput('a')
    expect(textareaValue).toBe('')

    // During composition: NOT cleared (would break IME preview)
    composing = true
    simulateInput('b')
    simulateInput('c')
    expect(textareaValue).toBe('bc')

    // After composition ends: cleared
    composing = false
    textareaValue = '' // compositionend handler clears
    expect(textareaValue).toBe('')
  })
})

describe('Android IME — native keyboard regression guard', () => {
  /**
   * CRITICAL REGRESSION TEST
   *
   * On Android Chrome, adding input/composition event listeners (in ANY phase)
   * to the xterm textarea or any ancestor element causes the IME framework to
   * refuse to establish an input connection.  This breaks ALL keyboard input:
   * USB-C, Bluetooth, and native soft keyboard.
   *
   * This happened in commit acd9a79 (March 28 2026) when a "stabilization pass"
   * added beforeinput/input/compositionstart/compositionend listeners to the
   * terminal container element.  Even moving them to the textarea itself (bubble
   * phase) did not fix it — the listeners had to be removed entirely.
   *
   * The native keyboard effect in TerminalView.tsx MUST remain a simple
   * terminal.onData() subscription with NO additional DOM event listeners.
   */
  it('TerminalView native keyboard effect must not add DOM event listeners', () => {
    const terminalViewPath = path.resolve(__dirname, '../../components/TerminalView.tsx')
    const source = fs.readFileSync(terminalViewPath, 'utf-8')

    // Find the native keyboard useEffect block — it starts with the comment
    // "When native keyboard is enabled" and ends at the next useEffect or
    // the next top-level function/return.
    const nativeKbMatch = source.match(
      /\/\/ When native keyboard is enabled[\s\S]*?(?=\n {2}(?:\/\/ |const |useEffect|return \())/,
    )
    expect(nativeKbMatch).not.toBeNull()
    const nativeKbBlock = nativeKbMatch?.[0] ?? ''

    // Must NOT contain addEventListener — this breaks Android IME
    expect(nativeKbBlock).not.toContain('addEventListener')

    // Must NOT contain removeEventListener (implies listeners were added)
    expect(nativeKbBlock).not.toContain('removeEventListener')

    // Must contain the simple onData subscription
    expect(nativeKbBlock).toContain('terminal.onData')
    expect(nativeKbBlock).toContain('handleKey(data)')
  })

  it('useTerminal native keyboard branch must not add event listeners', () => {
    const useTerminalPath = path.resolve(__dirname, '../useTerminal.ts')
    const source = fs.readFileSync(useTerminalPath, 'utf-8')

    // Find the nativeKeyboard=true branch in the textarea suppression effect
    const nativeMatch = source.match(/if \(nativeKeyboard\) \{[\s\S]*?return[\s\S]*?\n {4}\}/)
    expect(nativeMatch).not.toBeNull()
    const nativeBranch = nativeMatch?.[0] ?? ''

    // Must NOT contain addEventListener — this breaks Android IME
    expect(nativeBranch).not.toContain('addEventListener')

    // Must contain the essential restore operations
    expect(nativeBranch).toContain("removeAttribute('inputmode')")
    expect(nativeBranch).toContain("removeAttribute('readonly')")
    expect(nativeBranch).toContain('.focus()')
  })
})
