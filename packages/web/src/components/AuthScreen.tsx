import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { QRScanner } from './QRScanner';
import { useIsMobile } from '../hooks/useMediaQuery';
import { IOSKeyboard } from './IOSKeyboard';
import { restoreLockState, authenticateBiometric as localBiometricAuth, setupPassword, enableLock } from '../lib/lock-screen';

// Same logo as LockScreen
const LOGO_LINES = [
  ' \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557',
  '\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551  \u2588\u2588\u2551',
  '\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551',
  '\u2588\u2588\u2551     \u2588\u2588\u2551     \u255a\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551',
  '\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551',
  ' \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d',
];

interface ServerStatus {
  configured: boolean;
  biometricConfigured: boolean;
  credentialId: string | null;
  userId: string | null;
}

interface AuthScreenProps {
  auth: AuthState;
  onBootstrapSubmit: (token: string) => Promise<boolean>;
  onPasswordSubmit: (password: string) => Promise<boolean>;
  onBiometricSubmit: (credentialId: string) => Promise<boolean>;
}

export function AuthScreen({ auth, onBootstrapSubmit, onPasswordSubmit, onBiometricSubmit }: AuthScreenProps) {
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showQRFallback, setShowQRFallback] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const isMobile = useIsMobile();
  const passwordFieldRef = useRef<HTMLInputElement>(null);

  // Check server-side auth status on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/password/status')
      .then((res) => res.json())
      .then((data: ServerStatus) => {
        if (!cancelled) setServerStatus(data);
      })
      .catch(() => {
        if (!cancelled) setServerStatus({ configured: false, biometricConfigured: false, credentialId: null, userId: null });
      });
    return () => { cancelled = true; };
  }, []);

  // After successful auth, restore local lock state so LockSetup is skipped
  const restoreAfterAuth = useCallback(async (pwd?: string) => {
    try {
      const stored = localStorage.getItem('clsh_jwt');
      if (stored) {
        const resp = await fetch('/api/auth/lock/state', {
          headers: { 'Authorization': `Bearer ${stored}` },
        });
        if (resp.ok) {
          const state = await resp.json() as {
            biometricConfigured: boolean;
            credentialId: string | null;
            userId: string | null;
            clientPwdHash: string | null;
          };
          const biometric = state.biometricConfigured && state.credentialId && state.userId
            ? { credentialId: state.credentialId, userId: state.userId }
            : null;
          await restoreLockState(pwd ?? null, biometric, state.clientPwdHash);
        }
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // ── Password handler ──
  const handlePasswordSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) return;
    setError('');

    // Set up local lock state BEFORE auth state changes, so useLockScreen
    // sees isLockEnabled()=true and doesn't trigger needsSetup.
    await setupPassword(trimmed);
    enableLock();

    const success = await onPasswordSubmit(trimmed);
    if (success) {
      // Restore biometric credential from server (non-blocking)
      void restoreAfterAuth(trimmed);
    } else if (auth.error) {
      setError(auth.error);
    } else {
      setError('Invalid password');
    }
  }, [password, onPasswordSubmit, auth.error, restoreAfterAuth]);

  // ── Face ID handler ──
  const handleBiometric = useCallback(async () => {
    if (!serverStatus?.credentialId || !serverStatus?.userId) return;
    setError('');

    // Write credential to localStorage temporarily so WebAuthn can find it
    try {
      localStorage.setItem('clsh_lock_credential', serverStatus.credentialId);
      localStorage.setItem('clsh_lock_user_id', serverStatus.userId);
    } catch { /* ignore */ }

    try {
      const ok = await localBiometricAuth();
      if (ok) {
        // Enable lock before auth state changes (same race condition fix)
        enableLock();

        const success = await onBiometricSubmit(serverStatus.credentialId);
        if (success) {
          void restoreAfterAuth();
        } else {
          setError('Authentication failed. Try your password.');
        }
      } else {
        setError('Face ID failed. Try again or use your password.');
      }
    } catch {
      setError('Face ID failed. Try again or use your password.');
    }
  }, [serverStatus, onBiometricSubmit, restoreAfterAuth]);

  // ── QR/bootstrap handlers ──
  const handleBootstrapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = bootstrapToken.trim();
    if (!trimmed) return;
    await onBootstrapSubmit(trimmed);
  };

  const handlePaste = () => {
    void navigator.clipboard.readText().then((text) => {
      if (text) setBootstrapToken(text.trim());
    }).catch(() => { /* clipboard unavailable */ });
  };

  const handleQRScan = async (token: string) => {
    setShowScanner(false);
    setShowQRFallback(false);
    const success = await onBootstrapSubmit(token);
    if (!success) setBootstrapToken('');
  };

  // IOSKeyboard handler for mobile password input
  const handleKey = useCallback(
    (data: string) => {
      if (data === '\r') {
        void handlePasswordSubmit();
      } else if (data === '\x7f') {
        setPassword((v) => v.slice(0, -1));
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        setPassword((v) => v + data);
      }
    },
    [handlePasswordSubmit],
  );

  const masked = (val: string) => '\u2022'.repeat(val.length);

  // Still loading status
  if (serverStatus === null) {
    return <div className="h-full bg-[#060606]" />;
  }

  const displayError = error || auth.error || '';
  const hasBiometric = serverStatus.biometricConfigured && !!serverStatus.credentialId;

  // ══════════════════════════════════════════════════════════════
  // PASSWORD/BIOMETRIC CONFIGURED → Show LockScreen-style UI
  // ══════════════════════════════════════════════════════════════
  if (serverStatus.configured) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#060606' }}>
        <div className={`flex flex-1 px-4 ${hasBiometric ? 'items-center justify-center' : 'items-start justify-center pt-[18vh]'}`}>
          <div className="w-full max-w-sm">
            {/* CLSH Logo (same as LockScreen) */}
            <div className={`${hasBiometric ? 'mb-10' : 'mb-4'} select-none text-center`}>
              <pre
                className="inline-block text-left"
                style={{
                  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 'clamp(7px, 2.5vw, 14px)',
                  lineHeight: 1.3,
                  color: '#f97316',
                  textShadow: '0 0 20px rgba(249, 115, 22, 0.4)',
                }}
              >
                {LOGO_LINES.join('\n')}
              </pre>
            </div>
            {!hasBiometric && (
              <p className="mb-4 text-center text-sm text-neutral-500">Enter password</p>
            )}

            {/* Face ID button */}
            {hasBiometric && (
              <>
                <button
                  onClick={() => void handleBiometric()}
                  disabled={auth.loading}
                  className="w-full rounded-md bg-clsh-orange px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {auth.loading ? 'Verifying...' : 'Unlock with Face ID'}
                </button>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-clsh-border" />
                  <span className="text-xs text-neutral-600">or</span>
                  <div className="h-px flex-1 bg-clsh-border" />
                </div>
              </>
            )}

            {/* Password field */}
            <div className="space-y-3">
              {isMobile ? (
                <div className="w-full rounded-md border border-clsh-orange bg-clsh-surface px-3 py-2.5 text-sm text-white">
                  {password ? masked(password) : ''}<span className="animate-pulse text-clsh-orange">|</span>
                </div>
              ) : (
                <input
                  ref={passwordFieldRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handlePasswordSubmit(); }}
                  placeholder="Password"
                  autoComplete="current-password"
                  autoFocus={!hasBiometric}
                  disabled={auth.loading}
                  className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange"
                />
              )}
              <button
                onClick={() => void handlePasswordSubmit()}
                disabled={!password || auth.loading}
                className="w-full rounded-md bg-clsh-orange px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {auth.loading ? 'Connecting...' : 'Unlock'}
              </button>
            </div>

            {/* Error */}
            {displayError && (
              <p className="mt-3 text-center text-xs text-red-400">{displayError}</p>
            )}

          </div>
        </div>

        {/* iOS Keyboard for mobile password */}
        {isMobile && (
          <IOSKeyboard onKey={handleKey} skin="ios-terminal" perKeyColors={{}} />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // NO PASSWORD CONFIGURED → QR/token flow (first time or fallback)
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="relative h-full bg-clsh-bg overflow-hidden">
      {showScanner && (
        <QRScanner
          onScan={(token) => void handleQRScan(token)}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">clsh</h1>
            <p className="mt-2 text-sm text-neutral-500">
              {isMobile ? 'Scan the QR code from your terminal' : 'Paste the token shown in your terminal'}
            </p>
          </div>

          {auth.error && (
            <div className="mb-4 text-center text-xs text-red-400">
              <p>{auth.error}</p>
              {isMobile && (
                <p className="mt-1">Press Enter in your terminal to generate a new QR code.</p>
              )}
            </div>
          )}

          {isMobile ? (
            <>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                disabled={auth.loading}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-clsh-orange px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                {auth.loading ? 'Connecting...' : 'Scan QR Code'}
              </button>

              {serverStatus.configured && showQRFallback && (
                <button
                  type="button"
                  onClick={() => setShowQRFallback(false)}
                  className="mt-4 w-full text-center text-sm text-neutral-500 transition-colors hover:text-white"
                >
                  Back to password
                </button>
              )}

              <div className="mt-8 text-center">
                <a
                  href="https://github.com/my-claude-utils/clsh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] tracking-wide text-neutral-600 transition-colors hover:text-neutral-400"
                >
                  Need help?
                </a>
              </div>
            </>
          ) : (
            <>
              <form onSubmit={(e) => void handleBootstrapSubmit(e)} className="space-y-4">
                <div>
                  <label htmlFor="bootstrap-token" className="mb-1.5 block text-xs font-medium text-neutral-400">
                    Bootstrap Token
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="bootstrap-token"
                      type="text"
                      value={bootstrapToken}
                      onChange={(e) => setBootstrapToken(e.target.value)}
                      placeholder="Paste token from terminal..."
                      autoComplete="off"
                      autoFocus
                      disabled={auth.loading}
                      className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 pr-20 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange"
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handlePaste()}
                        disabled={auth.loading}
                        className="rounded px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-clsh-orange active:text-clsh-orange disabled:opacity-50"
                        title="Paste from clipboard"
                      >
                        Paste
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={auth.loading || !bootstrapToken.trim()}
                  className="w-full rounded-md bg-clsh-orange px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {auth.loading ? 'Connecting...' : 'Connect'}
                </button>
              </form>

              {serverStatus.configured && showQRFallback && (
                <button
                  type="button"
                  onClick={() => setShowQRFallback(false)}
                  className="mt-4 w-full text-center text-sm text-neutral-500 transition-colors hover:text-white"
                >
                  Back to password
                </button>
              )}

              <p className="mt-6 text-center text-xs text-neutral-600">
                Run <code className="text-neutral-400">npx clsh-dev</code> on your Mac, then copy the token from the terminal output.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
