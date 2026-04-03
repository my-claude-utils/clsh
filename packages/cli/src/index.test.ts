import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('CLI version', () => {
  it('package.json version can be read', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
      version: string
    }
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
