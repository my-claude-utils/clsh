interface ConnectionOverlayProps {
  mode: 'detecting' | 'connecting';
}

const LABELS: Record<ConnectionOverlayProps['mode'], string> = {
  detecting: 'Detecting environment...',
  connecting: 'Connecting to clsh...',
};

/**
 * Transparent dark overlay shown while detecting mode or establishing
 * a WebSocket connection. Displays a pulsing orange dot and status text.
 * Auto-dismisses when the parent stops rendering it.
 */
export function ConnectionOverlay({ mode }: ConnectionOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-clsh-bg/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing dot */}
        <div className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clsh-orange opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-clsh-orange" />
        </div>

        {/* Status text */}
        <p className="text-sm text-neutral-400">{LABELS[mode]}</p>
      </div>
    </div>
  );
}
