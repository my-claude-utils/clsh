import type { Session } from '../lib/types';

interface TitleBarProps {
  session: Session;
  onBack: () => void;
  onOpenSettings?: () => void;
  editing: boolean;
  editValue: string;
  onEditStart: () => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

export function TitleBar({
  session,
  onBack,
  onOpenSettings,
  editing,
  editValue,
  onEditStart,
  onEditCommit,
  onEditCancel,
}: TitleBarProps) {
  return (
    <div
      style={{
        height: 44,
        background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        flexShrink: 0,
      }}
    >
      {/* Traffic lights */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
      </div>

      {/* Session name — tap to edit, typed via MacBook keyboard */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginLeft: 12,
          minWidth: 0,
        }}
      >
        {editing ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12,
                color: '#ccc',
                background: '#161616',
                border: '1px solid #f97316',
                borderRadius: 3,
                padding: '2px 6px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 180,
                display: 'inline-block',
              }}
            >
              {editValue}
              <span
                style={{
                  display: 'inline-block',
                  width: 1,
                  height: 14,
                  background: '#f97316',
                  marginLeft: 1,
                  verticalAlign: 'middle',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </span>
            <button
              onClick={onEditCommit}
              style={{
                background: 'none',
                border: 'none',
                color: '#28c840',
                cursor: 'pointer',
                padding: 0,
                fontSize: 13,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Confirm rename"
            >
              &#x2713;
            </button>
            <button
              onClick={onEditCancel}
              style={{
                background: 'none',
                border: 'none',
                color: '#ff5f57',
                cursor: 'pointer',
                padding: 0,
                fontSize: 13,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Cancel rename"
            >
              &#x2715;
            </button>
          </div>
        ) : (
          <>
            <span
              onClick={onEditStart}
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12,
                color: '#ccc',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.name}
            </span>
            <button
              onClick={onEditStart}
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                cursor: 'pointer',
                padding: 0,
                fontSize: 18,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Rename session"
            >
              &#x270E;
            </button>
          </>
        )}
      </div>

      {/* Grid + Settings buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            background: '#161616',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            color: '#666',
            fontSize: 14,
            cursor: 'pointer',
          }}
          aria-label="Back to grid"
        >
          &#x229E;
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              background: '#161616',
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              color: '#666',
              fontSize: 16,
              cursor: 'pointer',
            }}
            aria-label="Settings"
          >
            &#x2699;
          </button>
        )}
      </div>
    </div>
  );
}
