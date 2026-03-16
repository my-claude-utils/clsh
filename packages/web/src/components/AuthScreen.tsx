import { useState, type FormEvent } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { QRScanner } from './QRScanner';
import { useIsMobile } from '../hooks/useMediaQuery';

interface AuthScreenProps {
  auth: AuthState;
  onBootstrapSubmit: (token: string) => Promise<boolean>;
}

export function AuthScreen({ auth, onBootstrapSubmit }: AuthScreenProps) {
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const isMobile = useIsMobile();

  const handleSubmit = async (e: FormEvent) => {
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
    const success = await onBootstrapSubmit(token);
    if (!success) {
      setBootstrapToken('');
    }
  };

  return (
    <div className="relative h-full bg-clsh-bg overflow-hidden">
      {/* QR Scanner fullscreen overlay */}
      {showScanner && (
        <QRScanner
          onScan={(token) => void handleQRScan(token)}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Centered form area */}
      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Branding */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              clsh
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              {isMobile ? 'Scan the QR code from your terminal' : 'Paste the token shown in your terminal'}
            </p>
          </div>

          {/* Error (shown above action buttons) */}
          {auth.error && (
            <p className="mb-4 text-center text-xs text-red-400">
              {auth.error}
            </p>
          )}

          {isMobile ? (
            /* ── Mobile: QR-only ── */
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

              {auth.error && (
                <p className="mt-4 text-center text-xs text-neutral-500">
                  Press Enter in your terminal to generate a new QR code.
                </p>
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
            /* ── Desktop: token paste form ── */
            <>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div>
                  <label
                    htmlFor="bootstrap-token"
                    className="mb-1.5 block text-xs font-medium text-neutral-400"
                  >
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
