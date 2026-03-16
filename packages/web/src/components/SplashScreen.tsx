import { useState, useEffect } from 'react';

interface SplashScreenProps {
  /** When true, begins the fade-out sequence */
  ready: boolean;
  /** Called after fade-out completes, safe to unmount */
  onComplete: () => void;
}

const LOGO_LINES = [
  ' ██████╗██╗     ███████╗██╗  ██╗',
  '██╔════╝██║     ██╔════╝██║  ██║',
  '██║     ██║     ███████╗███████║',
  '██║     ██║     ╚════██║██╔══██║',
  '╚██████╗███████╗███████║██║  ██║',
  ' ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝',
];

const LINE_DELAY_MS = 200;
const LINE_DURATION_MS = 400;
const REVEAL_TOTAL_MS = (LOGO_LINES.length - 1) * LINE_DELAY_MS + LINE_DURATION_MS;
const FADEOUT_MS = 500;

type Phase = 'reveal' | 'loop' | 'fadeout';

export function SplashScreen({ ready, onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>('reveal');

  // Reveal -> Loop after all lines finish animating
  useEffect(() => {
    const timer = setTimeout(() => setPhase('loop'), REVEAL_TOTAL_MS);
    return () => clearTimeout(timer);
  }, []);

  // Loop -> Fadeout when ready prop becomes true (wait for reveal if still running)
  useEffect(() => {
    if (!ready || phase === 'fadeout') return;

    if (phase === 'reveal') {
      const timer = setTimeout(() => setPhase('fadeout'), REVEAL_TOTAL_MS);
      return () => clearTimeout(timer);
    }
    setPhase('fadeout');
  }, [ready, phase]);

  // Fadeout -> Done: use setTimeout (more reliable than onTransitionEnd)
  useEffect(() => {
    if (phase !== 'fadeout') return;
    const timer = setTimeout(onComplete, FADEOUT_MS + 50);
    return () => clearTimeout(timer);
  }, [phase, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: '#060606',
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: `opacity ${FADEOUT_MS}ms ease-out`,
        pointerEvents: phase === 'fadeout' ? 'none' : 'auto',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 320,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(249, 115, 22, 1)',
          filter: 'blur(80px)',
          animation: 'splash-glow 1333ms ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Logo lines */}
      <div
        style={{
          position: 'relative',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 'clamp(8px, 2.8vw, 16px)',
          lineHeight: 1.15,
          whiteSpace: 'pre',
          color: '#f97316',
          textShadow: '0 0 20px rgba(249,115,22,0.6), 0 0 60px rgba(249,115,22,0.2)',
        }}
      >
        {LOGO_LINES.map((line, i) => (
          <div
            key={i}
            style={{
              animation:
                phase === 'reveal' || phase === 'fadeout'
                  ? `splash-line-in ${LINE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${i * LINE_DELAY_MS}ms both`
                  : `splash-shimmer 2s ease-in-out ${i * 150}ms infinite`,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes splash-line-in {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes splash-shimmer {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.85; }
        }
        @keyframes splash-glow {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 0.30; }
        }
      `}</style>
    </div>
  );
}
