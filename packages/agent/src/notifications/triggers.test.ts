import { describe, it, expect } from 'vitest'
import { PERMISSION_PATTERNS, ERROR_PATTERNS } from './triggers.js'

describe('triggers pattern exports', () => {
  it('exports PERMISSION_PATTERNS as non-empty array', () => {
    expect(Array.isArray(PERMISSION_PATTERNS)).toBe(true)
    expect(PERMISSION_PATTERNS.length).toBeGreaterThan(0)
  })

  it('exports ERROR_PATTERNS as non-empty array', () => {
    expect(Array.isArray(ERROR_PATTERNS)).toBe(true)
    expect(ERROR_PATTERNS.length).toBeGreaterThan(0)
  })

  it('PERMISSION_PATTERNS includes WebFetch/WebSearch', () => {
    const combined = PERMISSION_PATTERNS.map((p) => p.source).join('|')
    expect(combined).toContain('WebFetch')
    expect(combined).toContain('WebSearch')
  })
})
