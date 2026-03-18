import { useState, useRef, useCallback } from 'react';

export type DictationState = 'idle' | 'recording' | 'processing';

interface DictationReturn {
  state: DictationState;
  startRecording: () => void;
  stopRecording: () => void;
  error: string | null;
}

const SESSION_KEY = 'clsh_jwt';

/**
 * Hook for hold-to-talk voice dictation.
 * Records audio via MediaRecorder, POSTs to /api/transcribe, and calls onText with the result.
 */
export function useDictation(onText: (text: string) => void): DictationReturn {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (state !== 'idle') return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not available (requires HTTPS or localhost)');
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Prefer webm/opus, fall back to mp4/aac (iOS Safari)
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stopStream();
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          chunksRef.current = [];

          if (blob.size === 0) {
            setState('idle');
            return;
          }

          setState('processing');

          const token = localStorage.getItem(SESSION_KEY);
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');

          fetch('/api/transcribe', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
          })
            .then(async (res) => {
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error ?? `Transcription failed (${String(res.status)})`);
              }
              return res.json() as Promise<{ text: string }>;
            })
            .then(({ text }) => {
              if (text) onText(text);
              setState('idle');
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : 'Transcription failed';
              setError(msg);
              setState('idle');
            });
        };

        recorderRef.current = recorder;
        recorder.start();
        setState('recording');
      } catch (err: unknown) {
        stopStream();
        const msg = err instanceof Error ? err.message : 'Microphone access denied';
        setError(msg);
        setState('idle');
      }
    })();
  }, [state, onText, stopStream]);

  return { state, startRecording, stopRecording, error };
}
