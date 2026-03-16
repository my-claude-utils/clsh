import type { GridViewProps } from '../lib/types';
import { SessionCard } from './SessionCard';
import { NewSessionCard } from './NewSessionCard';
import { WorkspaceBar } from './WorkspaceBar';
import { PWAInstallBanner } from './PWAInstallBanner';

/**
 * Phone home screen: tmux-style grid of session cards.
 *
 * Layout (top to bottom):
 *   Header (44px) -> Section label (24px) -> Grid -> WorkspaceBar (32px)
 */
export function GridView({
  sessions,
  activeSessionId,
  onSessionSelect,
  onCreateSession,
  onCloseSession,
  onOpenSettings,
  wsStatus,
}: GridViewProps) {
  const isConnected = wsStatus === 'connected';
  return (
    <div
      className="flex flex-col"
      style={{
        height: '100%',
        background: '#0a0a0a',
        fontFamily: 'JetBrains Mono, monospace',
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 44, flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#f97316',
              letterSpacing: '0.15em',
            }}
          >
            CLSH
          </span>
          <span
            className="rounded-full px-2"
            style={{
              fontSize: 11,
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: '#555',
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
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
      </div>

      {/* Section label */}
      <div className="px-4" style={{ height: 24, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.1em',
            color: '#444',
            textTransform: 'uppercase' as const,
          }}
        >
          Active Workspaces
        </span>
      </div>

      {/* Connection status banner */}
      {!isConnected && (
        <div
          className="mx-3 mb-2 rounded-lg px-3 py-2 flex items-center gap-2"
          style={{
            background: wsStatus === 'reconnecting' || wsStatus === 'connecting'
              ? 'rgba(249, 115, 22, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${
              wsStatus === 'reconnecting' || wsStatus === 'connecting'
                ? 'rgba(249, 115, 22, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'
            }`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: wsStatus === 'reconnecting' || wsStatus === 'connecting' ? '#f97316' : '#ef4444',
              animation: wsStatus === 'reconnecting' || wsStatus === 'connecting' ? 'pulse-dot 1.5s infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11, color: '#999' }}>
            {wsStatus === 'reconnecting' || wsStatus === 'connecting'
              ? 'Reconnecting to server...'
              : 'Disconnected. Re-scan QR code or check if server is running.'}
          </span>
        </div>
      )}

      {/* Card grid */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-2"
        style={{ minHeight: 0 }}
      >
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={onSessionSelect}
              onClose={onCloseSession}
            />
          ))}
          <NewSessionCard onCreateSession={onCreateSession} />
        </div>
      </div>

      {/* PWA install banner (mobile only, above tab bar) */}
      <PWAInstallBanner />

      {/* Workspace bar */}
      <WorkspaceBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={onSessionSelect}
      />
    </div>
  );
}
