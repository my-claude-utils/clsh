import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

export interface WSClientOptions {
  url: string;
  sessionId: string;
  token: string;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  /** Called when the server closes the connection with code 4001 (bad/expired token). */
  onUnauthorized?: () => void;
}

/** Interval between application-level ping messages (ms). */
const PING_INTERVAL = 25_000;

/** Max backoff delay for reconnection (ms). */
const MAX_BACKOFF = 30_000;

/**
 * WebSocket client with persistent reconnection.
 *
 * Handles JSON serialization of the clsh protocol messages,
 * automatic reconnection on disconnect (no hard cap — keeps trying
 * with exponential backoff), periodic heartbeat pings, and
 * visibility/network-aware wake-up reconnection.
 */
export class TerminalWSClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  private readonly options: WSClientOptions;

  private get url() { return this.options.url; }
  private get token() { return this.options.token; }
  private get onMessage() { return this.options.onMessage; }
  private get onStatusChange() { return this.options.onStatusChange; }

  // Bound handlers for add/removeEventListener
  private readonly handleVisibility = () => this.onVisibilityChange();
  private readonly handleOnline = () => this.forceReconnect();

  constructor(options: WSClientOptions) {
    this.options = options;
  }

  /**
   * Attempt to connect to the WebSocket server.
   * Returns true if authenticated within 2 seconds, false otherwise
   * (useful for demo mode detection).
   *
   * H5: Token is sent as the first WS message (not in the URL query string).
   */
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve(false);
        return;
      }

      // Close any previous WebSocket to prevent zombie connections.
      // Without this, each reconnect attempt leaves an orphaned WebSocket
      // whose onclose handler triggers duplicate reconnect cycles.
      this.closeWebSocket();

      this.onStatusChange('connecting');

      // H5: Connect without token in URL
      const wsUrl = new URL(this.url);

      let settled = false;

      const timeout = setTimeout(() => {
        // Connection did not establish in 2 seconds
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 2000);

      try {
        this.ws = new WebSocket(wsUrl.toString());
      } catch {
        clearTimeout(timeout);
        settled = true;
        this.onStatusChange('disconnected');
        resolve(false);
        return;
      }

      this.ws.onopen = () => {
        // Send auth as first message (H5)
        this.ws?.send(JSON.stringify({ type: 'auth', token: this.token }));
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;

          // Handle auth response
          if (msg.type === 'auth_ok') {
            clearTimeout(timeout);
            if (!settled) {
              settled = true;
              resolve(true);
            }
            this.reconnectAttempts = 0;
            this.onStatusChange('connected');
            this.startPing();
            this.addLifecycleListeners();
            return;
          }

          if (msg.type === 'auth_error') {
            clearTimeout(timeout);
            if (!settled) {
              settled = true;
              resolve(false);
            }
            // Auth failed, treat like 4001
            this.disposed = true;
            this.removeLifecycleListeners();
            this.options.onUnauthorized?.();
            return;
          }

          this.onMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve(false);
        }
        this.stopPing();
        this.onStatusChange('disconnected');
        if (event.code !== 1000) {
          console.warn(`[clsh] WS closed: code=${String(event.code)} reason="${event.reason}"`);
        }
        // 4001 = backend rejected token (expired JWT or backend restarted).
        // Stop reconnecting — the stored token is no longer valid.
        if (event.code === 4001) {
          this.disposed = true;
          this.removeLifecycleListeners();
          this.options.onUnauthorized?.();
          return;
        }
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        console.warn('[clsh] WS connection error');
        // onclose will fire after onerror, so reconnect is handled there
      };
    });
  }

  /**
   * Send a client message over the WebSocket connection.
   * Silently drops messages if not connected.
   */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Permanently disconnect. No further reconnection attempts will be made.
   */
  disconnect(): void {
    this.disposed = true;
    this.removeLifecycleListeners();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.closeWebSocket();
    this.onStatusChange('disconnected');
  }

  /**
   * Closes the current WebSocket without triggering reconnection.
   * Detaches all event handlers first to prevent stale callbacks.
   */
  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.stopPing();
  }

  /**
   * Force an immediate reconnection attempt.
   * Resets the backoff counter so the first attempt is instant.
   * Used by visibility-change and online-event handlers.
   */
  forceReconnect(): void {
    if (this.disposed) return;
    // Already connected — nothing to do
    if (this.ws?.readyState === WebSocket.OPEN) return;

    // Cancel any pending scheduled reconnect
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reset backoff and try immediately
    this.reconnectAttempts = 0;
    this.onStatusChange('reconnecting');
    void this.connect();
  }

  // --------------- Heartbeat ---------------

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // --------------- Lifecycle listeners ---------------

  private addLifecycleListeners(): void {
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('online', this.handleOnline);
  }

  private removeLifecycleListeners(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('online', this.handleOnline);
  }

  private onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    // Page became visible — check if connection is still alive
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.forceReconnect();
    } else {
      // Connection looks open, send a ping to verify it's alive.
      // If the connection is actually dead the send will fail and
      // onclose will fire, triggering reconnection.
      this.send({ type: 'ping' });
    }
  }

  // --------------- Reconnection ---------------

  private scheduleReconnect(): void {
    if (this.disposed) return;

    // Already have a pending reconnect scheduled
    if (this.reconnectTimer !== null) return;

    this.onStatusChange('reconnecting');

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), MAX_BACKOFF);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
