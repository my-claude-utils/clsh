import { useState, useCallback, useEffect, useRef } from 'react'

export interface AuthState {
  isAuthenticated: boolean
  token: string | null
  loading: boolean
  error: string | null
}

interface AuthReturn {
  auth: AuthState
  authenticateWithBootstrap: (token: string) => Promise<boolean>
  authenticateWithPassword: (password: string) => Promise<boolean>
  authenticateWithBiometric: (credentialId: string) => Promise<boolean>
  logout: () => void
  /** Called when the WS closes with code 4001 (token expired/backend restarted) */
  handleUnauthorized: () => void
}

const SESSION_KEY = 'clsh_jwt'
const STORAGE = localStorage // persists across PWA close/reopen (sessionStorage did not)

const INITIAL_STATE: AuthState = {
  isAuthenticated: false,
  token: null,
  loading: false,
  error: null,
}

/**
 * Sends a POST to an auth endpoint and stores the returned JWT on success.
 * Shared by all authentication methods to avoid repetition.
 */
async function callAuthEndpoint(
  url: string,
  body: Record<string, string>,
  setAuth: React.Dispatch<React.SetStateAction<AuthState>>,
  options?: { cleanupUrl?: boolean; errorFallback?: string },
): Promise<boolean> {
  setAuth((prev) => ({ ...prev, loading: true, error: null }))
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const data = (await response.json()) as { error?: string }
      const fallback =
        options?.errorFallback ?? `Authentication failed (${String(response.status)})`
      const message = data.error ?? fallback
      setAuth((prev) => ({ ...prev, loading: false, error: message }))
      return false
    }

    const data = (await response.json()) as { token: string }
    setAuth({ isAuthenticated: true, token: data.token, loading: false, error: null })
    try {
      STORAGE.setItem(SESSION_KEY, data.token)
    } catch {
      // Ignore storage errors
    }

    if (options?.cleanupUrl) {
      try {
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('token')
        cleanUrl.hash = ''
        window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search)
      } catch {
        // URL cleanup is cosmetic — auth already succeeded
      }
    }

    return true
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error'
    setAuth((prev) => ({ ...prev, loading: false, error: message }))
    return false
  }
}

/**
 * Auth state management hook.
 *
 * Stores the JWT in localStorage so it persists across PWA close/reopen.
 * Supports bootstrap token authentication (scan QR once, stay connected for 30 days).
 *
 * On mount, checks for a `?token=` URL parameter and auto-authenticates.
 */
export function useAuth(): AuthReturn {
  const [auth, setAuth] = useState<AuthState>(() => {
    // Restore JWT from localStorage — survives PWA close/reopen and page refresh
    try {
      const stored = STORAGE.getItem(SESSION_KEY)
      if (stored) {
        return { isAuthenticated: true, token: stored, loading: false, error: null }
      }
    } catch {
      // storage unavailable (private mode, etc.) — ignore
    }
    return INITIAL_STATE
  })

  const authenticateWithBootstrap = useCallback(
    (bootstrapToken: string) =>
      callAuthEndpoint('/api/auth/bootstrap', { token: bootstrapToken }, setAuth, {
        cleanupUrl: true,
      }),
    [],
  )

  const authenticateWithPassword = useCallback(
    (password: string) => callAuthEndpoint('/api/auth/password', { password }, setAuth),
    [],
  )

  const authenticateWithBiometric = useCallback(
    (credentialId: string) =>
      callAuthEndpoint('/api/auth/biometric', { credentialId }, setAuth, {
        errorFallback: 'Authentication failed',
      }),
    [],
  )

  const logout = useCallback(() => {
    try {
      STORAGE.removeItem(SESSION_KEY)
    } catch {
      // Ignore
    }
    setAuth(INITIAL_STATE)
  }, [])

  // Auto-authenticate from URL token on mount (runs once)
  const autoAuthRan = useRef(false)
  useEffect(() => {
    if (autoAuthRan.current) return
    autoAuthRan.current = true

    // Check hash fragment first (new format)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const hashToken = hashParams.get('token')
      if (hashToken) {
        try {
          window.history.replaceState({}, '', window.location.pathname)
        } catch {
          /* iOS Safari PWA — ignore */
        }
        void authenticateWithBootstrap(hashToken)
        return
      }
    }
    // Fallback: check query param (legacy format)
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      void authenticateWithBootstrap(urlToken)
      return
    }

    // If already authenticated from localStorage, skip mode check
    if (auth.isAuthenticated) return

    // Check server auth mode — auto-authenticate for tailscale mode
    void (async () => {
      try {
        const modeRes = await fetch('/api/auth/mode')
        if (!modeRes.ok) return
        const { mode } = (await modeRes.json()) as { mode: string; skipBootstrap: boolean }

        if (mode === 'tailscale') {
          const autoRes = await fetch('/api/auth/auto')
          if (autoRes.ok) {
            const data = (await autoRes.json()) as { token: string }
            setAuth({ isAuthenticated: true, token: data.token, loading: false, error: null })
            try {
              STORAGE.setItem(SESSION_KEY, data.token)
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        // Server unreachable — will retry via reconnection
      }
    })()
  }, [])

  const handleUnauthorized = useCallback(() => {
    // Token rejected by backend (expired or backend restarted with new JWT secret).
    // Clear stored token so the user is shown the auth screen.
    try {
      STORAGE.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    setAuth(INITIAL_STATE)
  }, [])

  return {
    auth,
    authenticateWithBootstrap,
    authenticateWithPassword,
    authenticateWithBiometric,
    logout,
    handleUnauthorized,
  }
}
