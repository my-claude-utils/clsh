import { useState, useCallback } from 'react';
import { authenticateBiometric, verifyPassword } from '../lib/lock-screen';
import { useIsMobile } from '../hooks/useMediaQuery';
import { IOSKeyboard } from './IOSKeyboard';

const LOGO_LINES = [
  ' \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557',
  '\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551  \u2588\u2588\u2551',
  '\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551',
  '\u2588\u2588\u2551     \u2588\u2588\u2551     \u255a\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551',
  '\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551',
  ' \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d',
];

interface LockScreenProps {
  hasBiometric: boolean;
  onUnlock: () => void;
}

export function LockScreen({ hasBiometric, onUnlock }: LockScreenProps) {
  const isMobile = useIsMobile();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBiometric = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const ok = await authenticateBiometric();
      if (ok) {
        onUnlock();
      } else {
        setError('Face ID failed. Try again or use your password.');
      }
    } catch {
      setError('Face ID failed. Try again or use your password.');
    } finally {
      setLoading(false);
    }
  }, [onUnlock]);

  const handlePassword = useCallback(async () => {
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      const ok = await verifyPassword(password);
      if (ok) {
        onUnlock();
      } else {
        setError('Wrong password');
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  }, [password, onUnlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handlePassword();
    },
    [handlePassword],
  );

  // IOSKeyboard key handler for mobile
  const handleKey = useCallback(
    (data: string) => {
      if (data === '\r') {
        handlePassword();
      } else if (data === '\x7f') {
        setPassword((v) => v.slice(0, -1));
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        setPassword((v) => v + data);
      }
    },
    [handlePassword],
  );

  // Mask password for display
  const masked = (val: string) => '\u2022'.repeat(val.length);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#060606' }}>
      <div className={`flex flex-1 px-4 ${hasBiometric ? 'items-center justify-center' : 'items-start justify-center pt-[18vh]'}`}>
        <div className="w-full max-w-sm">
          {/* CLSH Logo */}
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

          {/* Label when password-only */}
          {!hasBiometric && (
            <p className="mb-4 text-center text-sm text-neutral-500">Enter password</p>
          )}

          {/* Biometric unlock */}
          {hasBiometric && (
            <>
              <button
                onClick={handleBiometric}
                disabled={loading}
                className="w-full rounded-md bg-clsh-orange px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Unlock with Face ID'}
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-clsh-border" />
                <span className="text-xs text-neutral-600">or</span>
                <div className="h-px flex-1 bg-clsh-border" />
              </div>
            </>
          )}

          {/* Password unlock */}
          <div className="space-y-3">
            {isMobile ? (
              <div className="w-full rounded-md border border-clsh-orange bg-clsh-surface px-3 py-2.5 text-sm text-white">
                {password ? masked(password) : ''}<span className="animate-pulse text-clsh-orange">|</span>
              </div>
            ) : (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Password"
                autoFocus={!hasBiometric}
                className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange"
              />
            )}
            <button
              onClick={handlePassword}
              disabled={!password || loading}
              className="w-full rounded-md bg-clsh-orange px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Unlock
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-3 text-center text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>

      {/* iOS Keyboard for mobile */}
      {isMobile && (
        <IOSKeyboard onKey={handleKey} skin="ios-terminal" perKeyColors={{}} />
      )}
    </div>
  );
}
