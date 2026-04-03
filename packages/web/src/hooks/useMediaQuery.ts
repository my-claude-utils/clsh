import { useState, useEffect } from 'react';

/**
 * React hook that tracks whether a CSS media query matches.
 *
 * Uses `window.matchMedia` and subscribes to change events
 * so the component re-renders when the match state changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);

    // Sync state in case it changed between render and effect
    setMatches(mql.matches);

    const handler = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };

    mql.addEventListener('change', handler);

    return () => {
      mql.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * Convenience hook that returns true when viewport width is 768px or below.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}
