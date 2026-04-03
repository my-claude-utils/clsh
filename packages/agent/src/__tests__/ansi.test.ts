import { describe, expect, it } from 'vitest'
import { ORANGE, DIM, YELLOW, RESET } from '../ansi.js'

describe('ANSI constants', () => {
  it('exports the expected escape sequences', () => {
    expect(ORANGE).toBe('\x1b[38;5;208m')
    expect(DIM).toBe('\x1b[2m')
    expect(YELLOW).toBe('\x1b[33m')
    expect(RESET).toBe('\x1b[0m')
  })
})
