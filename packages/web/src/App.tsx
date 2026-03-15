import { useState, useCallback, useEffect, useRef } from 'react';
import { GridView } from './components/GridView';
import { TerminalView } from './components/TerminalView';
import SkinStudio from './components/SkinStudio';
import { SettingsPanel } from './components/SettingsPanel';
import { AuthScreen } from './components/AuthScreen';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { useAuth } from './hooks/useAuth';
import { useSessionManager } from './hooks/useSessionManager';
import { useSkin } from './hooks/useSkin';
import type { View } from './lib/types';

export function App() {
  const { auth, authenticateWithBootstrap, handleUnauthorized } = useAuth();
  const { sessions, wsClient, messageBus, createSession, closeSession, getSessionOutput, setSessionSnapshot, renameSession } = useSessionManager(auth, handleUnauthorized);
  const { skin, setSkin, perKeyColors, setPerKeyColors } = useSkin();

  const [view, setView] = useState<View>('grid');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Reactive session creation: navigate to a new session when it arrives
  const awaitingNewSession = useRef(false);
  const sessionCountAtCreate = useRef(0);

  useEffect(() => {
    if (!awaitingNewSession.current) return;
    if (sessions.length > sessionCountAtCreate.current) {
      const newest = sessions[sessions.length - 1];
      setActiveSessionId(newest.id);
      setView('terminal');
      awaitingNewSession.current = false;
    }
  }, [sessions]);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setView('terminal');
  }, []);

  const handleCreateSession = useCallback(() => {
    sessionCountAtCreate.current = sessions.length;
    awaitingNewSession.current = true;
    createSession();
  }, [createSession, sessions.length]);

  const handleBack = useCallback((snapshot: string) => {
    if (snapshot && activeSessionId) {
      setSessionSnapshot(activeSessionId, snapshot);
    }
    setView('grid');
  }, [activeSessionId, setSessionSnapshot]);

  const handleOpenSkinStudio = useCallback(() => {
    setSettingsOpen(false);
    setView('skin-studio');
  }, []);

  const handleCloseSkinStudio = useCallback(() => {
    setView('terminal');
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  // Auth gate
  if (!auth.isAuthenticated) {
    return (
      <AuthScreen
        auth={auth}
        onBootstrapSubmit={authenticateWithBootstrap}
      />
    );
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  if (view === 'terminal' && activeSession) {
    return (
      <>
        <TerminalView
          session={activeSession}
          wsClient={wsClient}
          messageBus={messageBus}
          getSessionOutput={getSessionOutput}
          onBack={handleBack}
          onOpenSkinStudio={handleOpenSkinStudio}
          onOpenSettings={handleOpenSettings}
          onRenameSession={renameSession}
          skin={skin}
          perKeyColors={perKeyColors}
        />
        {settingsOpen && (
          <SettingsPanel
            onClose={handleCloseSettings}
            onOpenSkinStudio={handleOpenSkinStudio}
            sessionCount={sessions.length}
          />
        )}
      </>
    );
  }

  if (view === 'skin-studio') {
    return (
      <SkinStudio
        currentSkin={skin}
        onSkinChange={setSkin}
        perKeyColors={perKeyColors}
        onPerKeyColorChange={setPerKeyColors}
        onClose={handleCloseSkinStudio}
      />
    );
  }

  return (
    <>
      <GridView
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onCreateSession={handleCreateSession}
        onCloseSession={closeSession}
        onOpenSettings={handleOpenSettings}
      />
      {settingsOpen && (
        <SettingsPanel
          onClose={handleCloseSettings}
          onOpenSkinStudio={handleOpenSkinStudio}
          sessionCount={sessions.length}
        />
      )}
      <PWAInstallBanner />
    </>
  );
}
