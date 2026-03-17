import { useEffect, useRef, useCallback, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

import { CLSH_THEME } from '../lib/theme';
import { captureColoredScreen } from '../lib/captureTerminalScreen';

interface UseTerminalReturn {
  terminal: Terminal | null;
  write: (data: string) => void;
  getDimensions: () => { cols: number; rows: number } | null;
  fit: () => void;
  /** Returns the current visible screen content as plain text (ANSI-free). */
  captureScreen: () => string;
  /** Scrolls the terminal viewport to the very bottom. */
  scrollToBottom: () => void;
}

/**
 * xterm.js lifecycle hook.
 *
 * Creates a Terminal instance, loads WebGL renderer (with canvas fallback),
 * waits for JetBrains Mono font to load before opening, and auto-fits on
 * container resize via ResizeObserver.
 *
 * Returns `terminal` via useState so dependent effects fire *after* the
 * terminal has been opened and attached to the DOM.
 */
export function useTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  options?: { nativeKeyboard?: boolean },
): UseTerminalReturn {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  // Use state (not just ref) so that history-replay effects fire when the
  // terminal transitions from null → ready after terminal.open() completes.
  const [terminalReady, setTerminalReady] = useState<Terminal | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 12,
      theme: CLSH_THEME,
      allowProposedApi: true,
      convertEol: true,
      scrollback: 2000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const init = async () => {
      try {
        await document.fonts.load('12px "JetBrains Mono"');
      } catch {
        // Font unavailable — proceed with fallback
      }

      if (disposed) return;

      terminal.open(container);

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => { webglAddon.dispose(); });
        terminal.loadAddon(webglAddon);
      } catch {
        // Canvas renderer is the default fallback
      }

      try { fitAddon.fit(); } catch { /* ignore */ }

      // Textarea suppression is handled by a separate effect that reacts
      // to the nativeKeyboard option (see below).

      // Add momentum scrolling to the xterm viewport
      addMomentumScroll(terminal, container);

      // Observe container resizes for auto-fit
      const observer = new ResizeObserver(() => {
        if (!disposed) {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }
      });
      observer.observe(container);
      observerRef.current = observer;

      // Signal that the terminal is open and ready — this is what
      // triggers the history-replay useEffect in TerminalView.
      if (!disposed) {
        setTerminalReady(terminal);
      }
    };

    void init();

    return () => {
      disposed = true;

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      // setTerminalReady(null) is intentionally omitted: the component
      // will unmount anyway, and calling setState on unmount causes warnings.
    };
  }, [containerRef]);

  // Reactive textarea suppression: suppress iOS keyboard unless native keyboard is enabled.
  const nativeKeyboard = options?.nativeKeyboard ?? false;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !terminalReady) return;

    const textareas = () =>
      container.querySelectorAll<HTMLTextAreaElement>('.xterm-helper-textarea');

    if (nativeKeyboard) {
      // Restore xterm's textarea so physical keyboard input works
      textareas().forEach((t) => {
        t.removeAttribute('inputmode');
        t.removeAttribute('readonly');
        t.style.position = '';
        t.style.top = '';
        t.style.left = '';
        t.style.pointerEvents = '';
        t.style.opacity = '';
        t.focus();
      });
      return; // no suppression, no touchstart listener
    }

    // Suppress: move off-screen, prevent iOS keyboard
    const suppress = () => {
      textareas().forEach((t) => {
        t.setAttribute('inputmode', 'none');
        t.setAttribute('readonly', 'readonly');
        t.style.position = 'fixed';
        t.style.top = '-9999px';
        t.style.left = '-9999px';
        t.style.pointerEvents = 'none';
        t.style.opacity = '0';
        t.blur();
      });
    };
    suppress();
    // xterm may recreate the textarea on first input event
    const timer = setTimeout(suppress, 150);
    container.addEventListener('touchstart', suppress, { passive: true });

    return () => {
      clearTimeout(timer);
      container.removeEventListener('touchstart', suppress);
    };
  }, [containerRef, terminalReady, nativeKeyboard]);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const getDimensions = useCallback((): { cols: number; rows: number } | null => {
    const term = terminalRef.current;
    if (!term) return null;
    return { cols: term.cols, rows: term.rows };
  }, []);

  const fit = useCallback(() => {
    try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
  }, []);

  const captureScreen = useCallback((): string => {
    const term = terminalRef.current;
    if (!term) return '';
    return captureColoredScreen(term);
  }, []);

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, []);

  return { terminal: terminalReady, write, getDimensions, fit, captureScreen, scrollToBottom };
}

/**
 * Adds momentum (inertia) scrolling to the xterm terminal on touch devices.
 *
 * xterm handles the scroll during a swipe but stops abruptly when the finger
 * lifts. We track the swipe velocity and continue scrolling with exponential
 * deceleration after touchend, matching native iOS scroll feel.
 */
function addMomentumScroll(terminal: Terminal, container: HTMLElement): void {
  let lastY = 0;
  let lastTime = 0;
  let velocityY = 0; // pixels per millisecond
  let accumulatedDelta = 0; // sub-line pixel accumulator
  let rafId: number | null = null;

  const lineHeight = () => terminal.options.fontSize ?? 12;

  const cancelMomentum = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    cancelMomentum();
    lastY = e.touches[0].clientY;
    lastTime = Date.now();
    velocityY = 0;
    accumulatedDelta = 0;
  };

  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0].clientY;
    const now = Date.now();
    const dt = Math.max(now - lastTime, 1);
    // Update velocity (exponential smoothing to reduce jitter)
    const rawVelocity = (lastY - y) / dt;
    velocityY = velocityY * 0.3 + rawVelocity * 0.7;

    // Actively scroll during touch — xterm's native touch scroll doesn't
    // fire because .xterm-screen sits on top of .xterm-viewport in the DOM.
    const deltaY = lastY - y;
    accumulatedDelta += deltaY;
    const lh = lineHeight();
    const lines = Math.trunc(accumulatedDelta / lh);
    if (lines !== 0) {
      terminal.scrollLines(lines);
      accumulatedDelta -= lines * lh;
    }

    lastY = y;
    lastTime = now;
  };

  const onTouchEnd = () => {
    accumulatedDelta = 0;
    if (Math.abs(velocityY) < 0.1) return;

    const friction = 0.92;
    const FRAME_MS = 16;

    const tick = () => {
      velocityY *= friction;
      if (Math.abs(velocityY) < 0.05) return;
      const lines = Math.round(velocityY * FRAME_MS / lineHeight());
      if (lines !== 0) terminal.scrollLines(lines);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
}
