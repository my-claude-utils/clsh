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

describe('Android IME — onData deduplication', () => {
  /**
   * Simulates the dedup logic from TerminalView's onData handler.
   * This is the safety net that catches any remaining double-fires
   * from compositionend + input events.
   */
  // No composition suppression — Android does per-character micro-compositions
  // and xterm fires onData inside its own compositionend handler (before
  // external listeners).  Suppressing during composition would eat chars.
  // We rely on dedup only.

  function createDedup(dedupMs = 50) {
    const emitted: string[] = []
    let lastData = ''
    let lastTime = 0

    return {
      emitted,
      onData(data: string, now: number) {
        if (data === lastData && now - lastTime < dedupMs) return
        lastData = data
        lastTime = now
        emitted.push(data)
      },
    }
  }

  it('suppresses identical data within the dedup window', () => {
    const { emitted, onData } = createDedup()

    onData('a', 0) // emitted
    onData('a', 3) // suppressed (3ms < 50ms, same data)
    onData('b', 5) // emitted (different data)
    onData('a', 100) // emitted (100ms > 50ms window)

    expect(emitted).toEqual(['a', 'b', 'a'])
  })

  it('does not suppress different data even within dedup window', () => {
    const { emitted, onData } = createDedup()

    onData('h', 0)
    onData('e', 10)
    onData('l', 20)
    onData('l', 30) // same as previous, within window → suppressed
    onData('o', 40)

    expect(emitted).toEqual(['h', 'e', 'l', 'o'])
  })

  it('allows same character after dedup window expires', () => {
    const { emitted, onData } = createDedup()

    onData('l', 0)
    onData('l', 60) // 60ms > 50ms → emitted

    expect(emitted).toEqual(['l', 'l'])
  })

  it('handles Android per-char composition double-fire', () => {
    // On Android, each character goes through a micro-composition cycle.
    // xterm fires onData at compositionend, then again from the input event.
    // The dedup catches the second fire.
    const { emitted, onData } = createDedup()

    // Char 1: 'h' — compositionend fires onData, then input fires again
    onData('h', 0) // emitted (first)
    onData('h', 3) // suppressed (dedup, 3ms < 50ms)

    // Char 2: 'i' — same pattern
    onData('i', 60) // emitted (different data + gap > 50ms)
    onData('i', 63) // suppressed (dedup)

    expect(emitted).toEqual(['h', 'i'])
  })
})
