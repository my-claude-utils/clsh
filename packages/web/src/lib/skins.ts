/**
 * Keyboard skin definitions for the clsh MacBook keyboard.
 * Each skin defines CSS custom property values applied via [data-skin] attribute.
 */

import type { SkinId, SkinDefinition, PerKeyColors } from './types';

export const SKINS: Record<SkinId, SkinDefinition> = {
  'macbook-silver': {
    id: 'macbook-silver',
    name: 'MacBook Silver',
    subtitle: 'default \u00b7 aluminum',
    vars: {
      kbdBg: '#141416',
      keyFace: '#1c1c1e',
      keyBorder: '#2e2e30',
      keySide: '#0e0e0f',
      keyLabel: '#8a8a8e',
      keyLabelShift: '#555558',
      keyHover: '#242426',
      keyActive: '#161618',
    },
  },

  'ios-terminal': {
    id: 'ios-terminal',
    name: 'iOS Terminal',
    subtitle: 'phone \u00b7 big keys',
    vars: {
      kbdBg: '#1b1b1d',
      keyFace: '#2c2c2e',
      keyBorder: '#3a3a3c',
      keySide: '#161618',
      keyLabel: '#ffffff',
      keyLabelShift: '#8e8e93',
      keyHover: '#3a3a3c',
      keyActive: '#1c1c1e',
    },
  },

  'gamer-rgb': {
    id: 'gamer-rgb',
    name: 'Gamer RGB',
    subtitle: 'rainbow \u00b7 animated',
    animated: true,
    vars: {
      kbdBg: '#0a0010',
      keyFace: '#0d001a',
      keyBorder: '#2a0050',
      keySide: '#050008',
      keyLabel: '#ffffff',
      keyLabelShift: '#dddddd',
      keyHover: '#1a0030',
      keyActive: '#0d001a',
    },
  },

  'custom-painted': {
    id: 'custom-painted',
    name: 'Custom Painted',
    subtitle: 'each key \u00b7 unique',
    vars: {
      kbdBg: '#0f0a00',
      keyFace: '#1a1200',
      keyBorder: '#2d2000',
      keySide: '#0a0800',
      keyLabel: '#ccaa44',
      keyLabelShift: '#aa8833',
      keyHover: '#231800',
      keyActive: '#0f0d00',
    },
  },

  'amber-retro': {
    id: 'amber-retro',
    name: 'Amber Retro',
    subtitle: 'phosphor \u00b7 terminal',
    vars: {
      kbdBg: '#0a0600',
      keyFace: '#1a1000',
      keyBorder: '#3d2800',
      keySide: '#0a0700',
      keyLabel: '#c87700',
      keyLabelShift: '#996000',
      keyHover: '#221500',
      keyActive: '#150e00',
    },
  },

  'ice-white': {
    id: 'ice-white',
    name: 'Ice White',
    subtitle: 'clean \u00b7 minimal',
    vars: {
      kbdBg: '#e8eaed',
      keyFace: '#f5f6f8',
      keyBorder: '#d0d2d5',
      keySide: '#b8babe',
      keyLabel: '#2a2a2a',
      keyLabelShift: '#555555',
      keyHover: '#ffffff',
      keyActive: '#e8eaed',
    },
  },
};

export const DEFAULT_SKIN: SkinId = 'ios-terminal';

/** All skin IDs in display order. */
export const SKIN_ORDER: SkinId[] = [
  'macbook-silver',
  'ios-terminal',
  'gamer-rgb',
  'custom-painted',
  'amber-retro',
  'ice-white',
];

/** Default per-key colors for the Custom Painted skin preview. */
export const DEFAULT_CUSTOM_COLORS: PerKeyColors = {
  // Row 1 (number row) — 13 keys
  '`': '#8B0000',
  '1': '#B8420A',
  '2': '#CC8500',
  '3': '#557A1C',
  '4': '#1A6B3A',
  '5': '#0D5C6E',
  '6': '#1A3A7A',
  '7': '#4A1878',
  '8': '#7B1255',
  '9': '#922B21',
  '0': '#6E2C00',
  '-': '#1B4332',
  '=': '#0D2137',
  // Row 2 (QWERTY) — 12 keys
  'q': '#7B3F00',
  'w': '#006B3C',
  'e': '#0A3D62',
  'r': '#1A1A5E',
  't': '#4A0E2A',
  'y': '#1B0000',
  'u': '#003300',
  'i': '#00004D',
  'o': '#330033',
  'p': '#333300',
  '[': '#003333',
  ']': '#1A0033',
  // Row 3 (ASDF) — 11 keys
  'a': '#4D0000',
  's': '#004D00',
  'd': '#00004D',
  'f': '#4D4D00',
  'g': '#004D4D',
  'h': '#4D004D',
  'j': '#2B1B0E',
  'k': '#0E2B1B',
  'l': '#1B0E2B',
  ';': '#2B0E1B',
  "'": '#0E1B2B',
  // Row 4 (ZXCV) — 10 keys
  'z': '#3D0C02',
  'x': '#023D0C',
  'c': '#0C023D',
  'v': '#3D3D02',
  'b': '#023D3D',
  'n': '#3D023D',
  'm': '#2B1500',
  ',': '#00152B',
  '.': '#152B00',
  '/': '#15002B',
};

/** Gamer RGB rainbow hues for per-key preview (degrees). */
export const GAMER_RGB_HUES: string[] = [
  '#ff0040', '#ff6600', '#ffcc00', '#33ff00', '#00ffcc',
  '#0066ff', '#6600ff', '#ff00cc', '#ff3333', '#ffaa00',
  '#ccff00', '#00ff66', '#00ccff', '#3300ff', '#cc00ff',
  '#ff0066', '#ff8800', '#eeff00', '#00ff00', '#00ffff',
  '#0000ff', '#8800ff', '#ff0088', '#ff4400', '#ddff00',
  '#00ff44', '#00ddff', '#0044ff', '#aa00ff', '#ff00aa',
  '#ff5500', '#bbff00', '#00ff88', '#00bbff', '#0055ff',
  '#bb00ff', '#ff0055', '#ff7700', '#99ff00', '#00ffaa',
  '#0099ff', '#0077ff', '#9900ff', '#ff0099', '#ff2200',
  '#77ff00', '#00ffdd',
];
