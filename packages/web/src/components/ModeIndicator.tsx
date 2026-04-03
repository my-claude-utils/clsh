/**
 * DEMO / LIVE / DETECTING mode badge.
 * Small pill badge displayed in the bottom-right corner of the frame.
 */
interface ModeIndicatorProps {
  mode: 'demo' | 'live' | 'detecting';
}

const MODE_CONFIG: Record<
  ModeIndicatorProps['mode'],
  { label: string; bg: string; dotColor: string | null }
> = {
  demo: { label: 'DEMO', bg: 'bg-clsh-orange', dotColor: null },
  live: { label: 'LIVE', bg: 'bg-green-600', dotColor: '#4ade80' },
  detecting: { label: '...', bg: 'bg-neutral-700', dotColor: null },
};

export function ModeIndicator({ mode }: ModeIndicatorProps) {
  const config = MODE_CONFIG[mode];

  return (
    <div className="absolute right-3 bottom-3 z-10">
      <div
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${config.bg}`}
      >
        {config.dotColor != null && (
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: config.dotColor }}
          />
        )}
        <span className="text-[10px] font-bold tracking-wider text-black">
          {config.label}
        </span>
      </div>
    </div>
  );
}
