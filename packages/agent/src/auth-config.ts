/** Auth mode configuration from ~/.clsh/config.json. */
export interface AuthConfig {
  mode: 'bootstrap' | 'tailscale' | 'persistent'
  /** Static token for persistent mode. */
  token?: string
}

export interface ResolvedAuth {
  mode: 'bootstrap' | 'tailscale' | 'persistent'
  token?: string
}

/**
 * Resolves the auth configuration from the config file.
 * Falls back to bootstrap mode if not configured or invalid.
 */
export function resolveAuthMode(config: AuthConfig | undefined): ResolvedAuth {
  if (!config) return { mode: 'bootstrap' }

  if (config.mode === 'tailscale') {
    return { mode: 'tailscale' }
  }

  if (config.mode === 'persistent' && config.token) {
    return { mode: 'persistent', token: config.token }
  }

  return { mode: 'bootstrap' }
}

/**
 * Whether to skip the bootstrap token / QR code flow entirely.
 */
export function shouldSkipBootstrap(auth: ResolvedAuth): boolean {
  return auth.mode === 'tailscale' || auth.mode === 'persistent'
}

/**
 * Whether to trust all connections without authentication.
 * Only true for tailscale mode where the network itself provides security.
 */
export function shouldTrustConnection(auth: ResolvedAuth): boolean {
  return auth.mode === 'tailscale'
}
