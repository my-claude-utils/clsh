import { useRef, useEffect } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { DemoEngine } from '../demo/demo-engine';
import type { DemoScript } from '../demo/demo-engine';
import type { TerminalWSClient } from '../lib/ws-client';
import type { MessageBus } from '../lib/message-bus';

interface TerminalPaneProps {
  sessionId: string;
  wsClient: TerminalWSClient | null;
  messageBus: MessageBus;
  label?: string;
  /** When provided and wsClient is null, plays this demo script. */
  demoScript?: DemoScript;
}

/**
 * Terminal pane component.
 *
 * Renders an xterm.js terminal instance, wires up stdin/stdout through
 * a WebSocket client, and sends resize events when the terminal dimensions
 * change.
 */
export function TerminalPane({
  sessionId,
  wsClient,
  messageBus,
  label,
  demoScript,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { terminal, write, getDimensions } = useTerminal(containerRef);

  // Subscribe to server messages for this session
  useEffect(() => {
    if (!terminal) return;

    const unsubscribe = messageBus.subscribe((msg) => {
      if (
        (msg.type === 'stdout' || msg.type === 'stderr') &&
        msg.sessionId === sessionId
      ) {
        write(msg.data);
      }
    });

    return unsubscribe;
  }, [terminal, messageBus, sessionId, write]);

  // Wire up terminal input and resize to WebSocket
  useEffect(() => {
    if (!terminal || !wsClient) return;

    // Terminal input -> WebSocket
    const onDataDisposable = terminal.onData((data: string) => {
      wsClient.send({ type: 'stdin', sessionId, data });
    });

    // Terminal resize -> WebSocket
    const onResizeDisposable = terminal.onResize(
      (size: { cols: number; rows: number }) => {
        wsClient.send({
          type: 'resize',
          sessionId,
          cols: size.cols,
          rows: size.rows,
        });
      },
    );

    // Send initial resize so server knows terminal dimensions
    const dims = getDimensions();
    if (dims) {
      wsClient.send({
        type: 'resize',
        sessionId,
        cols: dims.cols,
        rows: dims.rows,
      });
    }

    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
    };
  }, [terminal, wsClient, sessionId, getDimensions]);

  // Demo mode: play script when demoScript prop is provided.
  // The parent component only provides this prop when in demo mode
  // (i.e., when the WebSocket connection has failed).
  useEffect(() => {
    if (!terminal || !demoScript) return;

    const engine = new DemoEngine(write);
    const stop = engine.play(demoScript);

    return stop;
  }, [terminal, demoScript, write]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {label && (
        <div className="flex h-7 shrink-0 items-center border-b border-clsh-border bg-clsh-surface px-3">
          <span className="text-xs text-neutral-500">{label}</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 bg-clsh-bg"
      />
    </div>
  );
}
