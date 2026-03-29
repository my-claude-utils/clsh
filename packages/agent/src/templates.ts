import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ShellType } from './types.js'

/** A single session within a multi-session template. */
export interface TemplateSession {
  name: string
  shell?: ShellType
  cwd?: string
  command?: string
}

/** Multi-session template: creates multiple separate clsh sessions at once. */
export interface SessionTemplateV2 {
  name: string
  description?: string
  icon?: string
  sessions: TemplateSession[]
}

/**
 * Validates a raw value as a SessionTemplateV2.
 * Returns the typed template if valid, null otherwise.
 */
export function validateTemplate(raw: unknown): SessionTemplateV2 | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== 'string' || !obj.name) return null
  if (!Array.isArray(obj.sessions) || obj.sessions.length === 0) return null

  const sessions: TemplateSession[] = []
  for (const entry of obj.sessions) {
    if (typeof entry !== 'object' || entry === null) return null
    const s = entry as Record<string, unknown>
    if (typeof s.name !== 'string' || !s.name) return null
    sessions.push({
      name: s.name,
      shell: typeof s.shell === 'string' ? (s.shell as ShellType) : undefined,
      cwd: typeof s.cwd === 'string' ? s.cwd : undefined,
      command: typeof s.command === 'string' ? s.command : undefined,
    })
  }

  return {
    name: obj.name,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    sessions,
  }
}

/**
 * Loads all valid templates from a directory of JSON files.
 * Defaults to ~/.clsh/templates/. Silently skips invalid files.
 * Returns empty array if directory doesn't exist.
 */
export function loadTemplates(dir?: string): SessionTemplateV2[] {
  const templatesDir = dir ?? join(homedir(), '.clsh', 'templates')
  if (!existsSync(templatesDir)) return []

  const results: SessionTemplateV2[] = []
  try {
    const files = readdirSync(templatesDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const content = readFileSync(join(templatesDir, file), 'utf-8')
        const parsed = JSON.parse(content)
        const template = validateTemplate(parsed)
        if (template) results.push(template)
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory read failed
  }
  return results
}
