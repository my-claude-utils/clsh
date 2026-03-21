import { describe, it, expect } from 'vitest'

describe('Finding #6: stdin payload cap', () => {
  it('ws-handler.ts must define MAX_STDIN_SIZE', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../ws-handler.ts', import.meta.url), 'utf-8')
    expect(source).toContain('MAX_STDIN_SIZE')
  })
})
