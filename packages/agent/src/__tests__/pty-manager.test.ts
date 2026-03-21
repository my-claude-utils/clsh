import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildSafeEnv } from '../pty-manager.js'

describe('buildSafeEnv (Finding #9: env var allowlist)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('passes through allowed vars like PATH and HOME', () => {
    process.env['PATH'] = '/usr/bin'
    process.env['HOME'] = '/home/testuser'
    const env = buildSafeEnv()
    expect(env['PATH']).toBe('/usr/bin')
    expect(env['HOME']).toBe('/home/testuser')
  })

  it('blocks sensitive vars not in the allowlist', () => {
    process.env['AWS_SECRET_ACCESS_KEY'] = 'hunter2'
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA...'
    process.env['GITHUB_TOKEN'] = 'ghp_...'
    process.env['DATABASE_URL'] = 'postgres://...'
    process.env['NGROK_AUTHTOKEN'] = 'ngrok-token'
    process.env['OPENAI_API_KEY'] = 'sk-...'
    const env = buildSafeEnv()
    expect(env['AWS_SECRET_ACCESS_KEY']).toBeUndefined()
    expect(env['AWS_ACCESS_KEY_ID']).toBeUndefined()
    expect(env['GITHUB_TOKEN']).toBeUndefined()
    expect(env['DATABASE_URL']).toBeUndefined()
    expect(env['NGROK_AUTHTOKEN']).toBeUndefined()
    expect(env['OPENAI_API_KEY']).toBeUndefined()
  })

  it('allows ANTHROPIC_API_KEY (needed for Claude Code in PTY)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-...'
    const env = buildSafeEnv()
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-...')
  })

  it('always sets FORCE_COLOR and TERM', () => {
    const env = buildSafeEnv()
    expect(env['FORCE_COLOR']).toBe('1')
    expect(env['TERM']).toBe('xterm-256color')
  })

  it('passes through XDG_ prefixed vars', () => {
    process.env['XDG_RUNTIME_DIR'] = '/run/user/1000'
    process.env['XDG_CONFIG_HOME'] = '/home/test/.config'
    const env = buildSafeEnv()
    expect(env['XDG_RUNTIME_DIR']).toBe('/run/user/1000')
    expect(env['XDG_CONFIG_HOME']).toBe('/home/test/.config')
  })
})
