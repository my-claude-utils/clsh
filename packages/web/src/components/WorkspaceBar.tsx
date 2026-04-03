import type { Session } from '../lib/types';

interface WorkspaceBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
}

export function WorkspaceBar({
  sessions,
  activeSessionId,
  onSessionSelect,
}: WorkspaceBarProps) {
  return (
    <div
      className="flex items-center gap-0 overflow-x-auto px-2"
      style={{
        height: 32,
        background: '#000',
        borderTop: '1px solid #1a1a1a',
        scrollbarWidth: 'none',
        flexShrink: 0,
      }}
    >
      {sessions.map((session, idx) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            type="button"
            onClick={() => onSessionSelect(session.id)}
            className="flex-shrink-0 px-2.5 py-1"
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: isActive ? 700 : 400,
              background: isActive ? '#f97316' : 'transparent',
              color: isActive ? '#000' : '#555',
              borderRadius: isActive ? 4 : 0,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {idx}: {session.name}
          </button>
        );
      })}

      {/* Remote indicator placeholder */}
      {sessions.length > 0 && (
        <span
          className="ml-auto flex-shrink-0 px-2"
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: 'rgba(0,204,106,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          ● local
        </span>
      )}
    </div>
  );
}
