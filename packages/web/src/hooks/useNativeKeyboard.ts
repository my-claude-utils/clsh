import { useState, useCallback } from 'react';

const STORAGE_KEY = 'clsh_native_keyboard';

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useNativeKeyboard() {
  const [nativeKeyboard, setNativeKeyboardState] = useState(load);

  const setNativeKeyboard = useCallback((enabled: boolean) => {
    setNativeKeyboardState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { nativeKeyboard, setNativeKeyboard } as const;
}
