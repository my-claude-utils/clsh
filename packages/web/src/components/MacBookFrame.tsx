import type { ReactNode } from 'react';
import { NotchIndicator } from './NotchIndicator';

/**
 * Pixel-perfect MacBook Pro bezel wrapping the terminal content.
 * Dark bezel border with rounded corners, camera notch, and subtle glow.
 */
interface MacBookFrameProps {
  children: ReactNode;
  notchActive?: boolean;
}

export function MacBookFrame({ children, notchActive = false }: MacBookFrameProps) {
  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-[#0a0a0a] p-6">
      {/* Outer bezel with glow */}
      <div
        className="relative flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a]"
        style={{
          boxShadow:
            '0 0 80px rgba(0, 0, 0, 0.8), 0 0 20px rgba(249, 115, 22, 0.03)',
          /* Aspect ratio roughly matching a laptop screen */
          height: 'min(85vh, 900px)',
        }}
      >
        {/* Notch */}
        <div className="relative flex h-7 shrink-0 items-end justify-center">
          <div className="absolute top-0 flex h-7 w-44 items-center justify-center rounded-b-2xl bg-[#1a1a1a]">
            <NotchIndicator active={notchActive} />
          </div>
        </div>

        {/* Screen area */}
        <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-clsh-bg">
          {children}
        </div>
      </div>
    </div>
  );
}
