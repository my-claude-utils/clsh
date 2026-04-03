/**
 * Escape sequence mapping for the MacBook keyboard component.
 * Maps key IDs to the strings that should be sent to the PTY.
 */

const SHIFT_NUMBER_SYMBOLS: Record<string, string> = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
};

const SHIFT_SPECIAL_SYMBOLS: Record<string, string> = {
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
};

const FUNCTION_KEYS: Record<string, string> = {
  f1: '\x1bOP',
  f2: '\x1bOQ',
  f3: '\x1bOR',
  f5: '\x1b[15~',
};

const ARROW_KEYS: Record<string, string> = {
  'arrow-up': '\x1b[A',
  'arrow-down': '\x1b[B',
  'arrow-right': '\x1b[C',
  'arrow-left': '\x1b[D',
};

/** Modifier-only keys that should not produce output on their own. */
const MODIFIER_KEYS = new Set(['caps', 'fn', 'ctrl', 'opt-left', 'opt-right', 'cmd-left', 'cmd-right', 'shift-left', 'shift-right']);

/**
 * Convert a key ID + modifier state into the escape sequence to send to the PTY.
 * Returns an empty string for modifier-only keys.
 */
export function keyToEscapeSequence(key: string, shift: boolean, ctrl: boolean): string {
  // Modifier-only keys produce no output
  if (MODIFIER_KEYS.has(key)) return '';

  // Function keys
  if (FUNCTION_KEYS[key]) return FUNCTION_KEYS[key];

  // Arrow keys
  if (ARROW_KEYS[key]) return ARROW_KEYS[key];

  // Special named keys
  switch (key) {
    case 'return':
      return '\r';
    case 'backspace':
      return '\x7f';
    case 'tab':
      return '\t';
    case 'esc':
      return '\x1b';
    case 'space':
      return ' ';
  }

  // Ctrl+letter shortcuts
  if (ctrl && key.length === 1 && key >= 'a' && key <= 'z') {
    return String.fromCharCode(key.charCodeAt(0) - 96);
  }

  // Single character keys
  if (key.length === 1) {
    // Number row with shift -> symbols
    if (SHIFT_NUMBER_SYMBOLS[key] && shift) {
      return SHIFT_NUMBER_SYMBOLS[key];
    }
    // Special characters with shift
    if (SHIFT_SPECIAL_SYMBOLS[key] && shift) {
      return SHIFT_SPECIAL_SYMBOLS[key];
    }
    // Letters
    if (key >= 'a' && key <= 'z') {
      return shift ? key.toUpperCase() : key;
    }
    // Everything else (numbers without shift, symbols)
    return key;
  }

  return '';
}
