import { describe, it, expect } from 'vitest'
import { validateTemplate } from '../templates.js'

describe('validateTemplate', () => {
  it('accepts a valid template with sessions', () => {
    const raw = {
      name: 'dev',
      description: 'Dev environment',
      icon: 'laptop',
      sessions: [
        { name: 'editor', shell: 'bash', cwd: '~/projects', command: 'nvim .' },
        { name: 'server', shell: 'bash', command: 'npm run dev' },
      ],
    }
    const result = validateTemplate(raw)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('dev')
    expect(result!.sessions).toHaveLength(2)
    expect(result!.sessions[0].name).toBe('editor')
  })

  it('accepts a minimal template with just name and one session', () => {
    const raw = {
      name: 'minimal',
      sessions: [{ name: 'shell' }],
    }
    const result = validateTemplate(raw)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('minimal')
  })

  it('rejects template without name', () => {
    const raw = { sessions: [{ name: 'shell' }] }
    expect(validateTemplate(raw)).toBeNull()
  })

  it('rejects template without sessions array', () => {
    const raw = { name: 'bad' }
    expect(validateTemplate(raw)).toBeNull()
  })

  it('rejects template with empty sessions array', () => {
    const raw = { name: 'empty', sessions: [] }
    expect(validateTemplate(raw)).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(validateTemplate('string')).toBeNull()
    expect(validateTemplate(42)).toBeNull()
    expect(validateTemplate(null)).toBeNull()
    expect(validateTemplate(undefined)).toBeNull()
  })

  it('rejects session without name', () => {
    const raw = { name: 'bad', sessions: [{ shell: 'bash' }] }
    expect(validateTemplate(raw)).toBeNull()
  })
})
