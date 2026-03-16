import { useState, useEffect, useCallback } from 'react';
import {
  isLockEnabled,
  isBiometricAvailable as checkBiometric,
  hasBiometricConfigured,
  hasPasswordConfigured,
} from '../lib/lock-screen';

export interface UseLockScreenReturn {
  isLocked: boolean;
  needsSetup: boolean;
  biometricAvailable: boolean;
  hasBiometric: boolean;
  hasPassword: boolean;
  unlock: () => void;
  completeLockSetup: () => void;
}

export function useLockScreen(isAuthenticated: boolean): UseLockScreenReturn {
  const [isLocked, setIsLocked] = useState(() => isLockEnabled());
  const [needsSetup, setNeedsSetup] = useState(() => isAuthenticated && !isLockEnabled());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(() => hasBiometricConfigured());
  const [hasPassword, setHasPassword] = useState(() => hasPasswordConfigured());

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometric().then(setBiometricAvailable);
  }, []);

  // Determine if setup is needed when auth state changes (e.g. QR scan mid-session).
  // If lock state was restored (e.g. PWA password auth), skip setup.
  useEffect(() => {
    if (isAuthenticated) {
      if (isLockEnabled()) {
        // Lock state exists (restored from server or already set up)
        setNeedsSetup(false);
        setHasBiometric(hasBiometricConfigured());
        setHasPassword(hasPasswordConfigured());
      } else {
        setNeedsSetup(true);
      }
    }
  }, [isAuthenticated]);

  // Lock on visibility change (tab switch, app switch)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isLockEnabled()) {
        setIsLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated]);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  const completeLockSetup = useCallback(() => {
    setNeedsSetup(false);
    setIsLocked(false);
    setHasBiometric(hasBiometricConfigured());
    setHasPassword(hasPasswordConfigured());
  }, []);

  return {
    isLocked,
    needsSetup,
    biometricAvailable,
    hasBiometric,
    hasPassword,
    unlock,
    completeLockSetup,
  };
}
