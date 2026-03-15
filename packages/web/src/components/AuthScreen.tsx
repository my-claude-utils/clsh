import { useState, useRef, type FormEvent, type ClipboardEvent } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { IOSKeyboard } from './IOSKeyboard';
import { useIsMobile } from '../hooks/useMediaQuery';

interface AuthScreenProps {
  auth: AuthState;
  onBootstrapSubmit: (token: string) => Promise<boolean>;
}

export function AuthScreen({ auth, onBootstrapSubmit }: AuthScreenProps) {
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const isMobile = useIsMobile();
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = bootstrapToken.trim();
    if (!trimmed) return;
    await onBootstrapSubmit(trimmed);
  };

  /** Handle native paste event on the mobile input — no clipboard API, no iOS flicker. */
  const handleNativePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) setBootstrapToken(text.trim());
  };

  const handlePaste = () => {
    if (isMobile && mobileInputRef.current) {
      // Focus the hidden input — iOS will show its native "Paste" popup
      // above the cursor. User taps it → onPaste fires → no clipboard API needed.
      mobileInputRef.current.focus();
      return;
    }
    // Desktop fallback: use clipboard API (no permission issues on desktop)
    void navigator.clipboard.readText().then((text) => {
      if (text) setBootstrapToken(text.trim());
    }).catch(() => { /* clipboard unavailable */ });
  };

  const handleAuthKey = (data: string) => {
    if (auth.loading) return;
    if (data === '\r') {
      const trimmed = bootstrapToken.trim();
      if (trimmed) void onBootstrapSubmit(trimmed);
      return;
    }
    if (data === '\x7f' || data === '\b') {
      setBootstrapToken((prev) => prev.slice(0, -1));
      return;
    }
    // Only accept printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      setBootstrapToken((prev) => prev + data);
    }
  };

  return (
    <div className="relative h-full bg-clsh-bg overflow-hidden">
      {/* Centered form area — stays in place when keyboard opens */}
      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Branding */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              clsh
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Paste the token shown in your terminal
            </p>
          </div>

          {/* Bootstrap token form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="bootstrap-token"
                className="mb-1.5 block text-xs font-medium text-neutral-400"
              >
                Bootstrap Token
              </label>
              <div className="relative flex items-center">
                {/* On mobile: real input with inputMode="none" suppresses iOS keyboard.
                    Native paste (long-press or Paste button → focus) works without clipboard API. */}
                {isMobile ? (
                  <input
                    ref={mobileInputRef}
                    type="text"
                    value={bootstrapToken}
                    onChange={(e) => setBootstrapToken(e.target.value)}
                    onPaste={handleNativePaste}
                    onFocus={() => setShowKeyboard(true)}
                    inputMode="none"
                    placeholder="Long-press to paste token..."
                    autoComplete="off"
                    disabled={auth.loading}
                    className="w-full rounded-md border border-clsh-border bg-clsh-surface px-3 py-2.5 pr-20 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-clsh-orange min-h-[42px]"
                  />
                ) : (
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
                )}
                {/* Paste + keyboard toggle buttons */}
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
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => setShowKeyboard((prev) => !prev)}
                      disabled={auth.loading}
                      className={`rounded p-1.5 transition-colors active:text-clsh-orange disabled:opacity-50 ${showKeyboard ? 'text-clsh-orange' : 'text-neutral-500 hover:text-clsh-orange'}`}
                      title="Toggle keyboard"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
                      </svg>
                    </button>
                  )}
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

          {auth.error && (
            <p className="mt-3 text-center text-xs text-red-400">
              {auth.error}
            </p>
          )}

          <p className="mt-6 text-center text-xs text-neutral-600">
            Run <code className="text-neutral-400">npx clsh-dev</code> on your Mac and scan the QR code, or copy the token from the terminal output.
          </p>
        </div>
      </div>

      {/* iOS keyboard overlaid at bottom — does not shift content */}
      {isMobile && showKeyboard && (
        <div className="absolute bottom-0 left-0 right-0">
          <IOSKeyboard
            onKey={handleAuthKey}
            skin="ios-terminal"
            perKeyColors={{}}
          />
        </div>
      )}
    </div>
  );
}
