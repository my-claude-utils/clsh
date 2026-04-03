/**
 * MCP health check — warns on startup about MCP servers with missing or expired
 * OAuth tokens. This lets the user know they need to re-auth from a PC terminal
 * before phone sessions will have MCP access.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { YELLOW, DIM, RESET } from './ansi.js'

interface McpOAuthEntry {
  serverName?: string
  serverUrl?: string
  accessToken?: string
  expiresAt?: number
  refreshToken?: string
}

interface Credentials {
  mcpOAuth?: Record<string, McpOAuthEntry>
}

interface NeedsAuthEntry {
  timestamp: number
}

export function checkMcpHealth(): void {
  const claudeDir = join(homedir(), '.claude')
  const credPath = join(claudeDir, '.credentials.json')
  const authCachePath = join(claudeDir, 'mcp-needs-auth-cache.json')

  if (!existsSync(credPath)) return

  let creds: Credentials
  try {
    creds = JSON.parse(readFileSync(credPath, 'utf-8')) as Credentials
  } catch {
    return
  }

  const mcpOAuth = creds.mcpOAuth
  if (!mcpOAuth || Object.keys(mcpOAuth).length === 0) return

  // Load the needs-auth cache for extra context
  let needsAuth: Record<string, NeedsAuthEntry> = {}
  if (existsSync(authCachePath)) {
    try {
      needsAuth = JSON.parse(readFileSync(authCachePath, 'utf-8')) as Record<string, NeedsAuthEntry>
    } catch {
      // ignore
    }
  }

  const now = Date.now()
  const warnings: string[] = []

  for (const [key, entry] of Object.entries(mcpOAuth)) {
    if (!entry || typeof entry !== 'object') continue

    // Extract the human-readable server name (before the | hash)
    const serverName = key.split('|')[0]
    const token = entry.accessToken || ''
    const expiresAt = entry.expiresAt || 0
    const hasRefresh = Boolean(entry.refreshToken)

    if (!token) {
      warnings.push(`  ${YELLOW}⚠${RESET} MCP "${serverName}" — no access token (OAuth incomplete)`)
    } else if (expiresAt > 0 && expiresAt < now && !hasRefresh) {
      const expDate = new Date(expiresAt).toLocaleDateString()
      warnings.push(
        `  ${YELLOW}⚠${RESET} MCP "${serverName}" — token expired ${expDate}, no refresh token`,
      )
    }
  }

  // Also flag servers in needs-auth cache that aren't in mcpOAuth at all
  for (const serverName of Object.keys(needsAuth)) {
    const hasEntry = Object.keys(mcpOAuth).some((k) => k.startsWith(serverName + '|'))
    if (!hasEntry) {
      warnings.push(`  ${YELLOW}⚠${RESET} MCP "${serverName}" — flagged as needing auth`)
    }
  }

  if (warnings.length > 0) {
    console.log('')
    console.log(`  ${YELLOW}MCP auth issues detected:${RESET}`)
    for (const w of warnings) {
      console.log(w)
    }
    console.log(`  ${DIM}→ Re-auth from PC: cd <project> && claude${RESET}`)
    console.log('')
  }
}
