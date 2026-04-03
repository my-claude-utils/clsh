import { useState } from 'react';

interface NewSessionCardProps {
  onCreateSession: () => void;
}

export function NewSessionCard({ onCreateSession }: NewSessionCardProps) {
  const [hovered, setHovered] = useState(false);

  const accent = hovered ? '#f97316' : undefined;

  return (
    <button
      type="button"
      onClick={onCreateSession}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex w-full flex-col items-center justify-center"
      style={{
        aspectRatio: '1 / 1.18',
        background: 'transparent',
        borderRadius: 10,
        border: `1px dashed ${accent ?? '#333'}`,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontSize: 24,
          color: accent ?? '#555',
          lineHeight: 1,
        }}
      >
        +
      </span>
      <span
        style={{
          fontSize: 11,
          color: accent ?? '#444',
          fontFamily: 'JetBrains Mono, monospace',
          marginTop: 4,
        }}
      >
        new session
      </span>
    </button>
  );
}
