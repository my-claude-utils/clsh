/**
 * Hook for managing terminal color theme selection.
 * Persists to localStorage and returns the active ITheme for xterm.js.
 */

import { useState, useCallback } from 'react'
import type { ITheme } from '@xterm/xterm'
import {
  CLSH_THEME,
  TERMINAL_THEMES,
  DEFAULT_TERMINAL_THEME,
  type TerminalThemeId,
} from '../lib/theme'

const THEME_KEY = 'clsh_terminal_theme'

function loadThemeId(): TerminalThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored && stored in TERMINAL_THEMES) return stored as TerminalThemeId
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_TERMINAL_THEME
}

export function useTerminalTheme() {
  const [themeId, setThemeIdState] = useState<TerminalThemeId>(loadThemeId)

  const setThemeId = useCallback((id: TerminalThemeId) => {
    setThemeIdState(id)
    try {
      localStorage.setItem(THEME_KEY, id)
    } catch {
      // localStorage unavailable
    }
  }, [])

  const theme: ITheme = TERMINAL_THEMES[themeId]?.theme ?? CLSH_THEME

  return { themeId, setThemeId, theme } as const
}
