import { useState, useCallback, useEffect } from 'react';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthReturn {
  auth: AuthState;
  authenticateWithBootstrap: (token: string) => Promise<boolean>;
  logout: () => void;
  /** Called when the WS closes with code 4001 (token expired/backend restarted) */
  handleUnauthorized: () => void;
}

const SESSION_KEY = 'clsh_jwt';
const STORAGE = localStorage; // persists across PWA close/reopen (sessionStorage did not)

const INITIAL_STATE: AuthState = {
  isAuthenticated: false,
  token: null,
  loading: false,
  error: null,
};

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
      const stored = STORAGE.getItem(SESSION_KEY);
      if (stored) {
        return { isAuthenticated: true, token: stored, loading: false, error: null };
      }
    } catch {
      // storage unavailable (private mode, etc.) — ignore
    }
    return INITIAL_STATE;
  });

  const authenticateWithBootstrap = useCallback(
    async (bootstrapToken: string): Promise<boolean> => {
      setAuth((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: bootstrapToken }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          const message = body.error ?? `Authentication failed (${String(response.status)})`;
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error: message,
          }));
          return false;
        }

        const data = (await response.json()) as { token: string };

        setAuth({
          isAuthenticated: true,
          token: data.token,
          loading: false,
          error: null,
        });

        // Persist JWT so page refresh doesn't force re-auth
        try {
          STORAGE.setItem(SESSION_KEY, data.token);
        } catch {
          // Ignore storage errors
        }

        // Clean up the URL (remove token from query or hash) without a page reload
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        url.hash = '';
        window.history.replaceState({}, '', url.pathname + url.search);

        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Network error';
        setAuth((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
        return false;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    try {
      STORAGE.removeItem(SESSION_KEY);
    } catch {
      // Ignore
    }
    setAuth(INITIAL_STATE);
  }, []);

  // Auto-authenticate from URL #token= hash fragment on mount (H6: token in fragment, not query)
  useEffect(() => {
    // Check hash fragment first (new format)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashToken = hashParams.get('token');
      if (hashToken) {
        window.history.replaceState({}, '', window.location.pathname);
        void authenticateWithBootstrap(hashToken);
        return;
      }
    }
    // Fallback: check query param (legacy format)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      void authenticateWithBootstrap(urlToken);
    }
  }, [authenticateWithBootstrap]);

  const handleUnauthorized = useCallback(() => {
    // Token rejected by backend (expired or backend restarted with new JWT secret).
    // Clear stored token so the user is shown the auth screen.
    try { STORAGE.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setAuth(INITIAL_STATE);
  }, []);

  return { auth, authenticateWithBootstrap, logout, handleUnauthorized };
}
