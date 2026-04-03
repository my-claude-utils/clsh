/**
 * Hook to start and stop demo mode playback across terminal panes.
 *
 * When `mode` transitions to 'demo', this hook creates a DemoEngine for
 * each pane and begins playing the corresponding script. When mode changes
 * away from 'demo' (or the component unmounts), all playback is cancelled.
 */

import { useEffect, useRef } from 'react';
import { DemoEngine } from '../demo/demo-engine';
import type { DemoScript } from '../demo/demo-engine';

interface PaneWriters {
  shell: ((data: string) => void) | null;
  tmux: ((data: string) => void) | null;
  claude: ((data: string) => void) | null;
}

interface DemoScripts {
  shell: DemoScript;
  tmux: DemoScript;
  claude: DemoScript;
}

export function useDemo(
  mode: 'demo' | 'live' | 'detecting',
  paneWriters: PaneWriters,
  scripts: DemoScripts,
): void {
  // Stable ref for the cleanup functions so we can cancel on mode change
  const cleanupsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Cancel any existing playback
    for (const cleanup of cleanupsRef.current) {
      cleanup();
    }
    cleanupsRef.current = [];

    if (mode !== 'demo') return;

    const entries: Array<{ writer: ((data: string) => void) | null; script: DemoScript }> = [
      { writer: paneWriters.shell, script: scripts.shell },
      { writer: paneWriters.tmux, script: scripts.tmux },
      { writer: paneWriters.claude, script: scripts.claude },
    ];

    for (const { writer, script } of entries) {
      if (writer) {
        const engine = new DemoEngine(writer);
        const stop = engine.play(script);
        cleanupsRef.current.push(stop);
      }
    }

    return () => {
      for (const cleanup of cleanupsRef.current) {
        cleanup();
      }
      cleanupsRef.current = [];
    };
  }, [mode, paneWriters.shell, paneWriters.tmux, paneWriters.claude, scripts]);
}
