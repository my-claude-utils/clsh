/**
 * Orange indicator dot inside the MacBook notch area.
 * Pulses when the Claude Code pane is active/streaming.
 */
interface NotchIndicatorProps {
  active: boolean;
}

export function NotchIndicator({ active }: NotchIndicatorProps) {
  if (!active) return null;

  return (
    <div
      className="h-2 w-2 rounded-full bg-clsh-orange"
      style={{
        animation: 'notch-pulse 2s ease-in-out infinite',
      }}
    />
  );
}
