import { useState, useCallback, useEffect, useRef } from 'react';
import { GridView } from './components/GridView';
import { TerminalView } from './components/TerminalView';
import SkinStudio from './components/SkinStudio';
import { SettingsPanel } from './components/SettingsPanel';
import { AuthScreen } from './components/AuthScreen';
import { SplashScreen } from './components/SplashScreen';

import { useAuth } from './hooks/useAuth';
import { useSessionManager } from './hooks/useSessionManager';
import { useSkin } from './hooks/useSkin';
import type { View } from './lib/types';

export function App() {
  const { auth, authenticateWithBootstrap, handleUnauthorized } = useAuth();
  const { sessions, wsClient, messageBus, createSession, closeSession, getSessionOutput, setSessionSnapshot, renameSession, status: wsStatus } = useSessionManager(auth, handleUnauthorized);
  const { skin, setSkin, perKeyColors, setPerKeyColors } = useSkin();

  const [view, setView] = useState<View>('grid');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Splash screen state — rendered as overlay so hooks always run
  const [splashDone, setSplashDone] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  // Splash is ready to dismiss when min reveal time passed AND auth is not in-flight
  const splashReady = minTimeElapsed && !auth.loading;

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

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Determine content to render (auth screen or main app).
  // While splash is still visible (including during fadeout), don't mount AuthScreen
  // so it never flashes underneath the fading overlay. Both backgrounds are #060606.
  let content: React.ReactNode;

  if (!auth.isAuthenticated) {
    content = splashDone ? (
      <AuthScreen
        auth={auth}
        onBootstrapSubmit={authenticateWithBootstrap}
      />
    ) : (
      <div className="h-full bg-[#060606]" />
    );
  } else if (view === 'terminal' && activeSession) {
    content = (
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
  } else if (view === 'skin-studio') {
    content = (
      <SkinStudio
        currentSkin={skin}
        onSkinChange={setSkin}
        perKeyColors={perKeyColors}
        onPerKeyColorChange={setPerKeyColors}
        onClose={handleCloseSkinStudio}
      />
    );
  } else {
    content = (
      <>
        <GridView
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onCreateSession={handleCreateSession}
          onCloseSession={closeSession}
          onOpenSettings={handleOpenSettings}
          wsStatus={wsStatus}
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

  return (
    <>
      {content}
      {!splashDone && (
        <SplashScreen ready={splashReady} onComplete={() => setSplashDone(true)} />
      )}
    </>
  );
}
