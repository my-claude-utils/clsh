import { useCallback, useRef } from 'react';
import { useDictation, type DictationState } from '../hooks/useDictation';
import type { ContextStripProps } from '../lib/types';

interface StripKey {
  label: string;
  widthMultiplier: number;
  data: string;
  accent?: boolean;
}

const STRIP_KEYS: StripKey[] = [
  { label: 'esc', widthMultiplier: 1.5, data: '\x1b', accent: true },
  { label: 'F1', widthMultiplier: 1, data: '\x1bOP' },
  { label: 'F2', widthMultiplier: 1, data: '\x1bOQ' },
  { label: 'F3', widthMultiplier: 1, data: '\x1bOR' },
  { label: 'F5', widthMultiplier: 1, data: '\x1b[15~' },
  { label: 'commit', widthMultiplier: 1.5, data: 'git commit\r' },
  { label: 'diff', widthMultiplier: 1.5, data: 'git diff\r' },
  { label: 'plan', widthMultiplier: 1.5, data: '/plan ' },
  { label: '====', widthMultiplier: 1.5, data: '\x03' },
];

const BASE_WIDTH = 36;

function micButtonStyle(state: DictationState): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 28,
    width: BASE_WIDTH * 1.5,
    flexShrink: 0,
    borderRadius: 4,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    userSelect: 'none',
  };
  if (state === 'recording') {
    return {
      ...base,
      background: '#ff3b30',
      border: '1px solid #ff3b30',
      color: '#fff',
      animation: 'mic-pulse 0.8s ease-in-out infinite',
    };
  }
  if (state === 'processing') {
    return {
      ...base,
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      color: '#555',
      animation: 'mic-spin 1s linear infinite',
    };
  }
  return {
    ...base,
    background: '#161616',
    border: '1px solid #2a2a2a',
    color: '#888',
  };
}

function hapticFeedback(): void {
  try { navigator.vibrate?.(50); } catch { /* ignore */ }
}

export function ContextStrip({ onKey, onDictatedText }: ContextStripProps) {
  const { state, startRecording, stopRecording, error } = useDictation(onDictatedText);

  // Track whether the touch moved (scroll) vs stayed in place (tap)
  const touchMovedRef = useRef(false);

  const handleTouchStart = useCallback(() => {
    touchMovedRef.current = false;
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMovedRef.current = true;
  }, []);

  const handleTouchEnd = useCallback(
    (data: string) => (e: React.TouchEvent) => {
      if (!touchMovedRef.current) {
        e.preventDefault();
        onKey(data);
      }
    },
    [onKey],
  );

  return (
    <>
      {/* Recording toast */}
      {state === 'recording' && (
        <div
          style={{
            position: 'fixed',
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 59, 48, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 16,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 600,
            animation: 'mic-pulse 0.8s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          Recording...
        </div>
      )}

      {/* Processing toast */}
      {state === 'processing' && (
        <div
          style={{
            position: 'fixed',
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(100, 100, 100, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 16,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", monospace',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          Transcribing...
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 59, 48, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 16,
            fontSize: 12,
            fontFamily: '"JetBrains Mono", monospace',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          height: 48,
          background: '#0d0d0d',
          borderTop: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        <style>{`
          @keyframes mic-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes mic-spin { 0% { opacity: 0.3; } 50% { opacity: 0.7; } 100% { opacity: 0.3; } }
        `}</style>

        {STRIP_KEYS.map((key) => (
          <button
            key={key.label}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd(key.data)}
            onMouseDown={(e) => {
              e.preventDefault();
              onKey(key.data);
            }}
            style={{
              height: 28,
              width: BASE_WIDTH * key.widthMultiplier,
              flexShrink: 0,
              background: key.accent ? 'rgba(255, 95, 87, 0.2)' : '#161616',
              border: '1px solid #2a2a2a',
              borderRadius: 4,
              color: key.accent ? '#ff5f57' : '#666',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              cursor: 'pointer',
              padding: 0,
              touchAction: 'manipulation',
              userSelect: 'none',
            }}
          >
            {key.label}
          </button>
        ))}

        {/* Tap-to-toggle mic button: tap to start, tap again to stop */}
        <button
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (state === 'recording') {
              stopRecording();
            } else if (state === 'idle') {
              hapticFeedback();
              startRecording();
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            if (state === 'recording') {
              stopRecording();
            } else if (state === 'idle') {
              startRecording();
            }
          }}
          disabled={state === 'processing'}
          style={micButtonStyle(state)}
        >
          {state === 'recording' ? '● stop' : state === 'processing' ? '...' : 'mic'}
        </button>
      </div>
    </>
  );
}
