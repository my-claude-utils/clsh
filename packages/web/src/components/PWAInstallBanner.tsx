import { useState, useEffect, useCallback, useRef } from 'react';

const DISMISS_KEY = 'clsh_pwa_banner_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Inline PWA install banner rendered above the WorkspaceBar in GridView.
 *
 * - Android: intercepts `beforeinstallprompt` for native install flow
 * - iOS: shows manual instructions (Share > Add to Home Screen)
 * - Dismissible, remembers dismissal in localStorage
 */
export function PWAInstallBanner() {
  const [visible, setVisible] = useState(() => {
    // Show immediately unless already dismissed or running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return false;
    if (!('ontouchstart' in window)) return false;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return false;
    } catch { /* storage unavailable */ }
    return true;
  });
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    // Capture Android install prompt
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch { /* ignore */ }
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt();
      deferredPrompt.current = null;
    }
    dismiss();
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      className="mx-3 mb-2 overflow-hidden rounded-lg"
      style={{
        background: 'linear-gradient(135deg, #1a1008 0%, #141414 100%)',
        border: '1px solid #2a1f0f',
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* App icon */}
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 36,
            height: 36,
            background: '#f97316',
            flexShrink: 0,
            fontSize: 16,
            fontWeight: 800,
            color: '#000',
            letterSpacing: '-0.03em',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          c/
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#e5e5e5',
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.3,
            }}
          >
            Add to Home Screen
          </p>
          {isIOS ? (
            <p
              style={{
                fontSize: 11,
                color: '#666',
                marginTop: 2,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1.3,
              }}
            >
              Tap{' '}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" className="inline align-text-bottom">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
              {' '}then "Add to Home Screen"
            </p>
          ) : (
            <p
              style={{
                fontSize: 11,
                color: '#666',
                marginTop: 2,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1.3,
              }}
            >
              Fullscreen terminal experience
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
          {!isIOS && deferredPrompt.current && (
            <button
              onClick={() => void handleInstall()}
              className="rounded-md px-2.5 py-1"
              style={{
                background: '#f97316',
                fontSize: 11,
                fontWeight: 600,
                color: '#000',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="flex items-center justify-center rounded p-1 transition-colors"
            style={{ color: '#444' }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
