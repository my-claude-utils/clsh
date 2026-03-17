/**
 * SkinStudio — full-screen skin selection and per-key color customization.
 * Replaces the terminal view when open on mobile.
 */

import type { SkinStudioProps, SkinId, PerKeyColors } from '../lib/types';
import { SKINS, SKIN_ORDER, DEFAULT_CUSTOM_COLORS, GAMER_RGB_HUES } from '../lib/skins';

// ── Mini keyboard rows for preview ──────────────────────────────────────────

const MACBOOK_PREVIEW_ROWS = [13, 12, 11, 10];
const IOS_PREVIEW_ROWS = [13, 10, 9, 9, 8, 12];

function getPreviewRows(skinId: SkinId): number[] {
  return skinId === 'ios-terminal' ? IOS_PREVIEW_ROWS : MACBOOK_PREVIEW_ROWS;
}

// ── Helper: get preview key colors per skin ─────────────────────────────────

function getPreviewColors(skinId: SkinId, perKeyColors: PerKeyColors): string[][] {
  const skin = SKINS[skinId];
  const rows = getPreviewRows(skinId);
  return rows.map((count, rowIdx) => {
    return Array.from({ length: count }, (_, colIdx) => {
      const idx = rowIdx * 13 + colIdx;
      if (skinId === 'gamer-rgb') {
        return GAMER_RGB_HUES[idx % GAMER_RGB_HUES.length];
      }
      if (skinId === 'custom-painted') {
        // Use provided perKeyColors or defaults
        const keys = Object.keys(DEFAULT_CUSTOM_COLORS);
        const keyId = keys[idx];
        if (keyId && perKeyColors[keyId]) return perKeyColors[keyId];
        if (keyId && DEFAULT_CUSTOM_COLORS[keyId]) return DEFAULT_CUSTOM_COLORS[keyId];
        return skin.vars.keyFace;
      }
      return skin.vars.keyFace;
    });
  });
}

// ── SkinStudio Component ────────────────────────────────────────────────────

export default function SkinStudio({
  currentSkin,
  onSkinChange,
  perKeyColors,
  onClose,
  nativeKeyboard,
  onNativeKeyboardChange,
}: SkinStudioProps) {
  const showNativeToggle = typeof window !== 'undefined' && window.innerWidth >= 768;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ background: '#060606', height: '100%' }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between shrink-0 px-4"
        style={{
          height: 44,
          background: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <button
          onClick={onClose}
          className="text-left"
          style={{
            color: '#f97316',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          &larr; terminal
        </button>
        <span
          style={{
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Space Grotesk', -apple-system, sans-serif",
          }}
        >
          Skin Studio
        </span>
        <span
          style={{
            color: '#555555',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {SKIN_ORDER.length} themes
        </span>
      </div>

      {/* ── Native Keyboard Toggle (tablet/desktop only) ─────── */}
      {showNativeToggle && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1a1a1a',
            background: '#0a0a0a',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => onNativeKeyboardChange(!nativeKeyboard)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: '#111',
              border: '1px solid #222',
              borderRadius: 10,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ccc',
                  fontFamily: "'Space Grotesk', -apple-system, sans-serif",
                }}
              >
                Native Keyboard
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#555',
                  marginTop: 2,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Use your device's physical keyboard
              </div>
            </div>
            {/* Toggle switch */}
            <div
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: nativeKeyboard ? '#f97316' : '#333',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
                marginLeft: 12,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: nativeKeyboard ? 22 : 2,
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </button>
        </div>
      )}

      {/* ── Live Preview ────────────────────────────────────────── */}
      <div style={{ background: '#111111', padding: 16, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: '#444444',
            marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          LIVE PREVIEW
        </div>
        <MiniKeyboard
          skinId={currentSkin}
          perKeyColors={perKeyColors}
          scale={0.65}
        />
      </div>

      {/* ── Themes Grid ─────────────────────────────────────────── */}
      <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: '#444444',
            marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          THEMES
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          {SKIN_ORDER.map((skinId) => (
            <SkinCard
              key={skinId}
              skinId={skinId}
              selected={currentSkin === skinId}
              perKeyColors={perKeyColors}
              onSelect={onSkinChange}
            />
          ))}
        </div>
      </div>

      {/* Bottom padding */}
      <div style={{ height: 32 }} />
    </div>
  );
}

// ── MiniKeyboard (preview) ──────────────────────────────────────────────────

function MiniKeyboard({
  skinId,
  perKeyColors,
  scale,
}: {
  skinId: SkinId;
  perKeyColors: PerKeyColors;
  scale: number;
}) {
  const colors = getPreviewColors(skinId, perKeyColors);
  const skin = SKINS[skinId];
  const isGamer = skinId === 'gamer-rgb';

  return (
    <div
      style={{
        background: skin.vars.kbdBg,
        borderRadius: 8,
        padding: 8,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: `${100 / scale}%`,
        ...(isGamer ? { animation: 'rgb-cycle 4s linear infinite' } : {}),
      }}
    >
      {colors.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-1"
          style={{ marginBottom: rowIdx < colors.length - 1 ? 3 : 0 }}
        >
          {row.map((color, colIdx) => (
            <div
              key={colIdx}
              style={{
                flex: 1,
                height: 18,
                background: color,
                borderRadius: 3,
                border: `1px solid ${skin.vars.keyBorder}`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── SkinCard ────────────────────────────────────────────────────────────────

function SkinCard({
  skinId,
  selected,
  perKeyColors,
  onSelect,
}: {
  skinId: SkinId;
  selected: boolean;
  perKeyColors: PerKeyColors;
  onSelect: (id: SkinId) => void;
}) {
  const skin = SKINS[skinId];
  const isLight = skinId === 'ice-white';
  const colors = getPreviewColors(skinId, perKeyColors);
  const isGamer = skinId === 'gamer-rgb';

  return (
    <button
      onClick={() => onSelect(skinId)}
      style={{
        background: '#111111',
        border: selected ? '1px solid #f97316' : '1px solid #222222',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        position: 'relative',
        boxShadow: selected ? '0 0 0 1px #f97316' : 'none',
      }}
    >
      {/* Selected checkmark */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <span style={{ color: '#000000', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
            &#10003;
          </span>
        </div>
      )}

      {/* Mini keyboard visualization */}
      <div
        style={{
          background: isLight ? '#e0e2e5' : skin.vars.kbdBg,
          padding: 8,
          ...(isGamer ? { animation: 'rgb-cycle 4s linear infinite' } : {}),
        }}
      >
        {colors.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="flex gap-0.5"
            style={{ marginBottom: rowIdx < colors.length - 1 ? 2 : 0 }}
          >
            {row.map((color, colIdx) => (
              <div
                key={colIdx}
                style={{
                  flex: 1,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Name + subtitle */}
      <div style={{ padding: '8px 10px' }}>
        <div
          style={{
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Space Grotesk', -apple-system, sans-serif",
          }}
        >
          {skin.name}
        </div>
        <div
          style={{
            color: '#555555',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {skin.subtitle}
        </div>
      </div>
    </button>
  );
}
