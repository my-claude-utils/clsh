import { useState, useEffect, useCallback, useRef } from 'react';

const DISMISS_KEY = 'clsh_pwa_banner_dismissed';
const SHOW_DELAY_MS = 30_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA install banner. Shows after 30 seconds on mobile browsers
 * that are NOT already running as a standalone PWA.
 *
 * - Android: intercepts `beforeinstallprompt` event for native install flow
 * - iOS: shows manual instructions (Share > Add to Home Screen)
 * - Dismissible, remembers dismissal in localStorage
 */
export function PWAInstallBanner() {
  const [visible, setVisible] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    // Skip if already running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Skip if previously dismissed
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* storage unavailable */ }

    // Capture Android install prompt
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);

    // Show banner after delay
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
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
    <div className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-clsh-border bg-clsh-surface p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Install clsh</p>
          {isIOS ? (
            <p className="mt-1 text-xs text-neutral-400">
              Tap <span className="inline-block align-text-bottom">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                </svg>
              </span> Share, then <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">
              Add clsh to your home screen for a fullscreen terminal experience.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isIOS && deferredPrompt.current && (
            <button
              onClick={() => void handleInstall()}
              className="rounded-md bg-clsh-orange px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded p-1 text-neutral-500 transition-colors hover:text-white"
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
