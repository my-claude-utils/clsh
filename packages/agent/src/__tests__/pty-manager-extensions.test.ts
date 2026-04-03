import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests for Phase 2b: PTYManager extensions.
 * Verifies new methods and interface fields exist.
 */

const source = readFileSync(resolve(import.meta.dirname, '..', 'pty-manager.ts'), 'utf-8')

describe('PTYSession interface extensions (Phase 2b)', () => {
  it('includes createdAt field', () => {
    expect(source).toContain('createdAt: number')
  })

  it('includes attachedClients field', () => {
    expect(source).toContain('attachedClients: number')
  })
})

describe('SessionMeta interface extensions (Phase 2b)', () => {
  it('includes attachedClients in SessionMeta', () => {
    // SessionMeta should carry attachedClients for broadcast to clients
    const metaMatch = source.match(/interface SessionMeta[\s\S]*?\}/)
    expect(metaMatch).not.toBeNull()
    expect(metaMatch![0]).toContain('attachedClients')
  })
})

describe('PTYManager new methods (Phase 2b)', () => {
  it('exports detach method', () => {
    expect(source).toContain('detach(id: string)')
  })

  it('exports incrementAttached method', () => {
    expect(source).toContain('incrementAttached(id: string)')
  })

  it('exports decrementAttached method', () => {
    expect(source).toContain('decrementAttached(id: string)')
  })

  it('exports listRich method', () => {
    expect(source).toContain('listRich(')
  })
})
