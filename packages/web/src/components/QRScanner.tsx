import { useRef, useEffect, useState, useCallback } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (token: string) => void;
  onClose: () => void;
}

/**
 * Fullscreen camera overlay that scans QR codes for bootstrap tokens.
 * Uses the rear camera and runs jsQR on each video frame.
 */
export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        // Use `ideal` constraint with fallback — iOS Safari rejects exact
        // facingMode strings with "The string did not match the expected pattern"
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scan();
        }
      } catch {
        if (!cancelled) setError('Camera access denied. Check your browser permissions.');
      }
    };

    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || cancelled) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const tick = () => {
        if (cancelled || !video.videoWidth) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code?.data) {
          const token = extractToken(code.data);
          if (token) {
            cleanup();
            onScan(token);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [onScan, cleanup]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close button */}
      <button
        onClick={() => { cleanup(); onClose(); }}
        className="absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2 text-white"
        aria-label="Close scanner"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="text-white text-sm mb-4">{error}</p>
            <p className="text-neutral-400 text-xs">
              Generate a new QR code by pressing Enter in your terminal,
              then try again or paste the token manually.
            </p>
          </div>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="flex-1 object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Viewfinder overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-2 border-[#F97316] rounded-lg" />
          </div>

          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-white text-sm">Point your camera at the QR code</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Extracts the bootstrap token from a scanned URL. Supports ?token= and #token= formats. */
function extractToken(data: string): string | null {
  try {
    const url = new URL(data);
    // Hash fragment format: #token=xxx
    if (url.hash) {
      const hashParams = new URLSearchParams(url.hash.slice(1));
      const token = hashParams.get('token');
      if (token) return token;
    }
    // Query param format: ?token=xxx
    const token = url.searchParams.get('token');
    if (token) return token;
  } catch {
    // Not a URL, ignore
  }
  return null;
}
