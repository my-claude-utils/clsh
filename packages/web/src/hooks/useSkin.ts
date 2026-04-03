/**
 * Hook for managing keyboard skin selection and per-key color overrides.
 * Persists to localStorage and applies skin via data-skin attribute on <html>.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SkinId, PerKeyColors } from '../lib/types';
import { DEFAULT_CUSTOM_COLORS, GAMER_RGB_HUES } from '../lib/skins';

const SKIN_KEY = 'clsh_skin';
const PER_KEY_KEY = 'clsh_per_key';

function loadSkin(): SkinId {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (stored) return stored as SkinId;
  } catch {
    // localStorage unavailable
  }
  return 'ios-terminal';
}

// All keyboard key IDs in row order — used to assign per-key colors for RGB and custom skins
const ALL_KEY_IDS = [
  '`','1','2','3','4','5','6','7','8','9','0','-','=','backspace',
  'tab','q','w','e','r','t','y','u','i','o','p','[',']','\\',
  'caps','a','s','d','f','g','h','j','k','l',';',"'",'return',
  'shift-left','z','x','c','v','b','n','m',',','.','/', 'shift-right',
  'fn','ctrl','opt-left','cmd-left','space','cmd-right','opt-right',
  'arrow-left','arrow-up','arrow-down','arrow-right',
  '|',
];

function buildGamerColors(): PerKeyColors {
  const colors: PerKeyColors = {};
  for (let i = 0; i < ALL_KEY_IDS.length; i++) {
    colors[ALL_KEY_IDS[i]] = GAMER_RGB_HUES[i % GAMER_RGB_HUES.length];
  }
  return colors;
}

function getDefaultColorsForSkin(skinId: string | null): PerKeyColors {
  if (skinId === 'custom-painted') return DEFAULT_CUSTOM_COLORS;
  if (skinId === 'gamer-rgb') return buildGamerColors();
  return {};
}

function loadPerKeyColors(): PerKeyColors {
  try {
    const currentSkin = localStorage.getItem(SKIN_KEY);
    return getDefaultColorsForSkin(currentSkin);
  } catch {
    // localStorage unavailable
  }
  return {};
}

export function useSkin() {
  const [skin, setSkinState] = useState<SkinId>(loadSkin);
  const [perKeyColors, setPerKeyColorsState] = useState<PerKeyColors>(loadPerKeyColors);

  const setSkin = useCallback((newSkin: SkinId) => {
    setSkinState(newSkin);
    // Load per-key colors appropriate for the skin
    const colors = getDefaultColorsForSkin(newSkin);
    setPerKeyColorsState(colors);
    try {
      if (Object.keys(colors).length > 0) {
        localStorage.setItem(PER_KEY_KEY, JSON.stringify(colors));
      } else {
        localStorage.removeItem(PER_KEY_KEY);
      }
    } catch { /* */ }
    try {
      localStorage.setItem(SKIN_KEY, newSkin);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setPerKeyColors = useCallback((colors: PerKeyColors) => {
    setPerKeyColorsState(colors);
    try {
      localStorage.setItem(PER_KEY_KEY, JSON.stringify(colors));
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Apply skin to document element via data-skin attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
  }, [skin]);

  return { skin, setSkin, perKeyColors, setPerKeyColors } as const;
}
