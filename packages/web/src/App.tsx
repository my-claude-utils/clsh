import { useState, useCallback, useEffect, useRef } from 'react';
import { GridView } from './components/GridView';
import { TerminalView } from './components/TerminalView';
import SkinStudio from './components/SkinStudio';
import { SettingsPanel } from './components/SettingsPanel';
import { AuthScreen } from './components/AuthScreen';
import { SplashScreen } from './components/SplashScreen';
import { LockSetup } from './components/LockSetup';
import { LockScreen } from './components/LockScreen';

import { useAuth } from './hooks/useAuth';
import { useSessionManager } from './hooks/useSessionManager';
import { useSkin } from './hooks/useSkin';
import { useLockScreen } from './hooks/useLockScreen';
import { getBiometricIds, getClientPwdHash } from './lib/lock-screen';
import type { View } from './lib/types';

export function App() {
  const { auth, authenticateWithBootstrap, authenticateWithPassword, authenticateWithBiometric, handleUnauthorized } = useAuth();
  const { sessions, wsClient, messageBus, createSession, closeSession, getSessionOutput, setSessionSnapshot, renameSession, status: wsStatus } = useSessionManager(auth, handleUnauthorized);
  const { skin, setSkin, perKeyColors, setPerKeyColors } = useSkin();
  const { isLocked, needsSetup, biometricAvailable, hasBiometric, unlock, completeLockSetup } = useLockScreen(auth.isAuthenticated);

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

  // Auto-sync local lock state to server (covers pre-existing setups before server-side storage)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token || syncedRef.current) return;
    syncedRef.current = true;

    const ids = getBiometricIds();
    const clientHash = getClientPwdHash();

    // Sync biometric credential to server if local has it
    if (ids) {
      void fetch('/api/auth/lock/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(ids),
      }).catch(() => {});
    }

    // Sync client password hash to server if local has it
    if (clientHash) {
      void fetch('/api/auth/lock/client-hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify({ clientHash }),
      }).catch(() => {});
    }
  }, [auth.isAuthenticated, auth.token]);

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
        onPasswordSubmit={authenticateWithPassword}
        onBiometricSubmit={authenticateWithBiometric}
      />
    ) : (
      <div className="h-full bg-[#060606]" />
    );
  } else if (needsSetup) {
    content = (
      <LockSetup biometricAvailable={biometricAvailable} onComplete={completeLockSetup} jwt={auth.token} />
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
      {isLocked && auth.isAuthenticated && !needsSetup && (
        <LockScreen hasBiometric={hasBiometric} onUnlock={unlock} />
      )}
      {!splashDone && (
        <SplashScreen ready={splashReady} onComplete={() => setSplashDone(true)} />
      )}
    </>
  );
}
