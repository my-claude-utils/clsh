import { describe, it, expect, vi } from 'vitest'
import { auditLog } from '../audit.js'

describe('auditLog (Finding #12)', () => {
  it('outputs structured JSON to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    auditLog('auth.login', { method: 'password', ip: '1.2.3.4' })
    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output.trim())
    expect(parsed.event).toBe('auth.login')
    expect(parsed.data.method).toBe('password')
    expect(parsed.data.ip).toBe('1.2.3.4')
    expect(parsed.timestamp).toBeDefined()
    spy.mockRestore()
  })
})
