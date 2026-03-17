import { useState, useRef, useEffect, useCallback } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { TitleBar } from './TitleBar';
import { ContextStrip } from './ContextStrip';
import { MacBookKeyboard } from './MacBookKeyboard';
import { IOSKeyboard } from './IOSKeyboard';
import type { TerminalViewProps } from '../lib/types';

/**
 * Full-screen terminal view for the phone UI.
 *
 * Layout (top to bottom, 100dvh):
 *   TitleBar (44px) -> xterm.js (flex:1) -> ContextStrip (48px) -> MacBookKeyboard (~244px)
 */
export function TerminalView({
  session,
  wsClient,
  messageBus,
  getSessionOutput,
  onBack,
  onRenameSession,
  onOpenSettings,
  skin,
  perKeyColors,
  nativeKeyboard,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { terminal, write, getDimensions, captureScreen, scrollToBottom } = useTerminal(containerRef, { nativeKeyboard });

  // Rename editing state — lifted here so we can intercept keyboard input
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Replay stored history then subscribe to new output for this session.
  useEffect(() => {
    if (!terminal) return;

    const history = getSessionOutput(session.id);
    for (const chunk of history) {
      write(chunk);
    }

    const unsubscribe = messageBus.subscribe((msg) => {
      if (
        (msg.type === 'stdout' || msg.type === 'stderr') &&
        msg.sessionId === session.id
      ) {
        write(msg.data);
      }
    });

    return unsubscribe;
  }, [terminal, messageBus, session.id, write, getSessionOutput]);

  // Wire terminal resize to WebSocket
  useEffect(() => {
    if (!terminal || !wsClient) return;

    const onResizeDisposable = terminal.onResize(
      (size: { cols: number; rows: number }) => {
        wsClient.send({
          type: 'resize',
          sessionId: session.id,
          cols: size.cols,
          rows: size.rows,
        });
      },
    );

    const dims = getDimensions();
    if (dims) {
      wsClient.send({
        type: 'resize',
        sessionId: session.id,
        cols: dims.cols,
        rows: dims.rows,
      });
    }

    return () => {
      onResizeDisposable.dispose();
    };
  }, [terminal, wsClient, session.id, getDimensions]);

  const startRename = useCallback(() => {
    setRenameValue(session.name);
    setRenaming(true);
  }, [session.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.name) {
      onRenameSession(session.id, trimmed);
    }
    setRenaming(false);
  }, [renameValue, session.name, session.id, onRenameSession]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
  }, []);

  // Key handler: routes to rename input or terminal WebSocket
  const handleKey = useCallback(
    (data: string) => {
      if (renaming) {
        if (data === '\r') {
          // Enter → commit
          commitRename();
        } else if (data === '\x1b') {
          // Escape → cancel
          cancelRename();
        } else if (data === '\x7f') {
          // Backspace → delete last char
          setRenameValue((v) => v.slice(0, -1));
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          // Printable character → append
          setRenameValue((v) => v + data);
        }
        return;
      }
      scrollToBottom();
      wsClient?.send({ type: 'stdin', sessionId: session.id, data });
    },
    [renaming, commitRename, cancelRename, wsClient, session.id, scrollToBottom],
  );

  // When native keyboard is enabled, wire xterm's onData to send keystrokes
  useEffect(() => {
    if (!terminal || !nativeKeyboard) return;
    const disposable = terminal.onData((data: string) => {
      handleKey(data);
    });
    return () => disposable.dispose();
  }, [terminal, nativeKeyboard, handleKey]);

  const handleBack = useCallback(() => {
    onBack(captureScreen());
  }, [onBack, captureScreen]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
        overflow: 'hidden',
      }}
      data-skin={skin}
    >
      <TitleBar
        session={session}
        onBack={handleBack}
        onOpenSettings={onOpenSettings}
        editing={renaming}
        editValue={renameValue}
        onEditStart={startRename}
        onEditCommit={commitRename}
        onEditCancel={cancelRename}
      />

      {/* Terminal area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      />

      {!nativeKeyboard && (
        <>
          <ContextStrip onKey={handleKey} />
          {skin === 'ios-terminal' ? (
            <IOSKeyboard onKey={handleKey} skin={skin} perKeyColors={perKeyColors} />
          ) : (
            <MacBookKeyboard onKey={handleKey} skin={skin} perKeyColors={perKeyColors} />
          )}
        </>
      )}
    </div>
  );
}
