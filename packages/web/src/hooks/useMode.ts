import { useState, useEffect } from 'react';
import { TerminalWSClient } from '../lib/ws-client';

export type AppMode = 'detecting' | 'demo' | 'live';

/**
 * Detects whether the app should run in demo mode or live mode.
 *
 * On mount, attempts a probe WebSocket connection with a 2-second timeout.
 * If the connection succeeds, the app is in live mode (agent is running).
 * If the connection times out or fails, the app falls back to demo mode.
 */
export function useMode(): AppMode {
  const [mode, setMode] = useState<AppMode>('detecting');

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In dev mode, connect directly to agent port to bypass Vite's WS proxy
      // which fails in WSL environments (ECONNRESET)
      const wsUrl = import.meta.env.DEV
        ? `ws://${window.location.hostname}:${__DEV_AGENT_PORT__}/ws`
        : `${protocol}//${window.location.host}/ws`;

      const probe = new TerminalWSClient({
        url: wsUrl,
        sessionId: 'probe',
        token: '',
        onMessage: () => {
          // Probe does not process messages
        },
        onStatusChange: () => {
          // Status changes handled via connect() return value
        },
      });

      const connected = await probe.connect();
      probe.disconnect();

      if (!cancelled) {
        setMode(connected ? 'live' : 'demo');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
