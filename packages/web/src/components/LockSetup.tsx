import { useState, useCallback, useRef } from 'react';
import { registerBiometric, setupPassword, enableLock, getBiometricIds, getClientPwdHash } from '../lib/lock-screen';
import { useIsMobile } from '../hooks/useMediaQuery';
import { IOSKeyboard } from './IOSKeyboard';

interface LockSetupProps {
  biometricAvailable: boolean;
  onComplete: () => void;
  jwt?: string | null;
}

type ActiveField = 'password' | 'confirm' | null;

export function LockSetup({ biometricAvailable, onComplete, jwt }: LockSetupProps) {
  const isMobile = useIsMobile();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [biometricSet, setBiometricSet] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>('password');
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const passwordsMatch = password.length >= 6 && password === confirm;
  const passwordError =
    confirm.length > 0 && password !== confirm
      ? 'Passwords do not match'
      : password.length > 0 && password.length < 6
        ? 'Minimum 6 characters'
        : '';

  const handleSetPassword = useCallback(async () => {
    if (!passwordsMatch) return;
    setLoading(true);
    try {
      await setupPassword(password);

      // Also save password server-side for PWA re-auth (non-fatal if it fails)
      if (jwt) {
        try {
          const clientHash = getClientPwdHash();
          await fetch('/api/auth/password/setup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`,
            },
            body: JSON.stringify({ password, clientHash }),
          });
        } catch {
          // Server-side setup failed, client lock still works
        }
      }

      setPasswordSet(true);
    } finally {
      setLoading(false);
    }
  }, [password, passwordsMatch, jwt]);

  const handleBiometric = useCallback(async () => {
    setBiometricError('');
    setLoading(true);
    try {
      const ok = await registerBiometric();
      if (ok) {
        setBiometricSet(true);

        // Store biometric credential server-side for PWA restoration
        if (jwt) {
          const ids = getBiometricIds();
          if (ids) {
            try {
              await fetch('/api/auth/lock/biometric', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${jwt}`,
                },
                body: JSON.stringify(ids),
              });
            } catch {
              // Non-fatal: biometric still works locally
            }
          }
        }
      } else {
        setBiometricError('Face ID setup failed. You can try again or continue with password only.');
      }
    } catch {
      setBiometricError('Face ID setup failed. You can try again or continue with password only.');
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  const handleContinue = useCallback(() => {
    enableLock();
    onComplete();
  }, [onComplete]);

  // IOSKeyboard key handler for mobile
  const handleKey = useCallback(
    (data: string) => {
      if (!activeField) return;
      const setter = activeField === 'password' ? setPassword : setConfirm;

      if (data === '\r') {
        // Enter: move to confirm field, or submit
        if (activeField === 'password') {
          setActiveField('confirm');
          confirmRef.current?.focus();
        } else {
          handleSetPassword();
        }
      } else if (data === '\x7f') {
        // Backspace
        setter((v) => v.slice(0, -1));
      } else if (data === '\t') {
        // Tab: switch fields
        if (activeField === 'password') {
          setActiveField('confirm');
          confirmRef.current?.focus();
        } else {
          setActiveField('password');
          passwordRef.current?.focus();
        }
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        // Printable character
        setter((v) => v + data);
      }
    },
    [activeField, handleSetPassword],
  );

  // Mask password for display
  const masked = (val: string) => '\u2022'.repeat(val.length);

  return (
    <div className="relative h-full bg-clsh-bg overflow-hidden flex flex-col">
      <div className="flex flex-1 items-center justify-center px-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Secure your session</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Set a password to protect your terminal. Face ID is optional but recommended.
            </p>
          </div>

          {/* Password fields */}
          {!passwordSet ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Password</label>
                {isMobile ? (
                  <div
                    className={`w-full rounded-md border px-3 py-2.5 text-sm transition-colors ${activeField === 'password' ? 'border-clsh-orange text-white' : 'border-clsh-border text-white'} bg-clsh-surface`}
                    onTouchStart={() => setActiveField('password')}
                    onClick={() => setActiveField('password')}
                    ref={passwordRef as unknown as React.Ref<HTMLDivElement>}
                  >
                    {activeField === 'password' ? (
                      <>{password ? masked(password) : ''}<span className="animate-pulse text-clsh-orange">|</span></>
                    ) : (
                      password ? masked(password) : <span className="text-neutral-600">Min 6 characters</span>
                    )}
                  </div>
                ) : (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Confirm password</label>
                {isMobile ? (
                  <div
                    className={`w-full rounded-md border px-3 py-2.5 text-sm transition-colors ${activeField === 'confirm' ? 'border-clsh-orange text-white' : 'border-clsh-border text-white'} bg-clsh-surface`}
                    onTouchStart={() => setActiveField('confirm')}
                    onClick={() => setActiveField('confirm')}
                    ref={confirmRef as unknown as React.Ref<HTMLDivElement>}
                  >
                    {activeField === 'confirm' ? (
                      <>{confirm ? masked(confirm) : ''}<span className="animate-pulse text-clsh-orange">|</span></>
                    ) : (
                      confirm ? masked(confirm) : <span className="text-neutral-600">Re-enter password</span>
                    )}
                  </div>
                ) : (
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange"
                  />
                )}
              </div>
              {passwordError && (
                <p className="text-xs text-red-400">{passwordError}</p>
              )}
              <button
                onClick={handleSetPassword}
                disabled={!passwordsMatch || loading}
                className="w-full rounded-md bg-clsh-orange px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Set password'}
              </button>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-green-800/50 bg-green-900/20 px-3 py-2.5 text-sm text-green-400">
              <span>&#10003;</span>
              <span>Password set</span>
            </div>
          )}

          {/* Biometric setup */}
          {biometricAvailable && passwordSet && (
            <div className="mt-4">
              {!biometricSet ? (
                <>
                  <button
                    onClick={handleBiometric}
                    disabled={loading}
                    className="w-full rounded-md border border-clsh-border bg-clsh-surface px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-clsh-orange disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? 'Setting up...' : 'Set up Face ID'}
                  </button>
                  {biometricError && (
                    <p className="mt-2 text-xs text-red-400">{biometricError}</p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-green-800/50 bg-green-900/20 px-3 py-2.5 text-sm text-green-400">
                  <span>&#10003;</span>
                  <span>Face ID set up</span>
                </div>
              )}
            </div>
          )}

          {/* Continue button */}
          {passwordSet && (
            <button
              onClick={handleContinue}
              className="mt-6 w-full rounded-md bg-clsh-orange px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          )}
        </div>
      </div>

      {/* iOS Keyboard for mobile */}
      {isMobile && !passwordSet && (
        <IOSKeyboard onKey={handleKey} skin="ios-terminal" perKeyColors={{}} />
      )}
    </div>
  );
}
