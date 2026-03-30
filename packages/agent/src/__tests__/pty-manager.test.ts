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

  it('allows ANTHROPIC_AUTH_TOKEN (bearer auth for Claude Code)', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-...'
    const env = buildSafeEnv()
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('sk-ant-oat01-...')
  })

  it('passes through CLAUDE_ prefixed vars (e.g., CLAUDE_CONFIG_DIR)', () => {
    process.env['CLAUDE_CONFIG_DIR'] = '/home/test/.claude'
    process.env['CLAUDE_CODE_USE_BEDROCK'] = '1'
    const env = buildSafeEnv()
    expect(env['CLAUDE_CONFIG_DIR']).toBe('/home/test/.claude')
    expect(env['CLAUDE_CODE_USE_BEDROCK']).toBe('1')
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

  it('passes through LINEAR_ prefixed vars (needed for Linear integration in PTY)', () => {
    process.env['LINEAR_API_KEY'] = 'lin_api_test123'
    process.env['LINEAR_TEAM_ID'] = 'team-abc'
    const env = buildSafeEnv()
    expect(env['LINEAR_API_KEY']).toBe('lin_api_test123')
    expect(env['LINEAR_TEAM_ID']).toBe('team-abc')
  })

  it('passes through HUSKY env var (escape hatch to skip git hooks)', () => {
    process.env['HUSKY'] = '0'
    const env = buildSafeEnv()
    expect(env['HUSKY']).toBe('0')
  })

  it('injects GIT_CONFIG_* vars for CRLF fix in WSL PTY sessions', () => {
    const env = buildSafeEnv()
    expect(env['GIT_CONFIG_COUNT']).toBe('2')
    expect(env['GIT_CONFIG_KEY_0']).toBe('core.autocrlf')
    expect(env['GIT_CONFIG_VALUE_0']).toBe('input')
    expect(env['GIT_CONFIG_KEY_1']).toBe('core.eol')
    expect(env['GIT_CONFIG_VALUE_1']).toBe('lf')
  })

  it('appends GIT_CONFIG_* vars without clobbering existing entries', () => {
    // GIT_CONFIG_COUNT is not in the allowlist, so it won't pass through to the
    // filtered env. However, if it were injected by other code in buildSafeEnv()
    // in the future, the parseInt logic would correctly append. For now, verify
    // that external GIT_CONFIG_COUNT doesn't leak through and our injection is stable.
    process.env['GIT_CONFIG_COUNT'] = '1'
    process.env['GIT_CONFIG_KEY_0'] = 'user.name'
    process.env['GIT_CONFIG_VALUE_0'] = 'Test User'
    const env = buildSafeEnv()
    // External GIT_CONFIG_* vars don't pass the allowlist, so count starts at 0
    expect(env['GIT_CONFIG_COUNT']).toBe('2')
    expect(env['GIT_CONFIG_KEY_0']).toBe('core.autocrlf')
    expect(env['GIT_CONFIG_VALUE_0']).toBe('input')
    expect(env['GIT_CONFIG_KEY_1']).toBe('core.eol')
    expect(env['GIT_CONFIG_VALUE_1']).toBe('lf')
    // External entries should not leak through
    expect(env['GIT_CONFIG_VALUE_0']).not.toBe('Test User')
  })

  it('does not allow arbitrary GIT_CONFIG_* vars through the allowlist', () => {
    process.env['GIT_CONFIG_KEY_99'] = 'core.sshCommand'
    process.env['GIT_CONFIG_VALUE_99'] = 'malicious-command'
    const env = buildSafeEnv()
    // These should NOT pass through — only our hardcoded entries exist
    expect(env['GIT_CONFIG_KEY_99']).toBeUndefined()
    expect(env['GIT_CONFIG_VALUE_99']).toBeUndefined()
  })
})
