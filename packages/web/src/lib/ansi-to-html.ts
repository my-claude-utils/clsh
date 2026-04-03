/**
 * Converts raw terminal output (with ANSI escape sequences) to HTML spans
 * with inline color styles. Matches the CLSH terminal theme colors.
 *
 * Handles:
 * - SGR codes (colors, bold)
 * - Screen clear (\x1b[2J, \x1b[H) — resets output to show only post-clear content
 * - Carriage return (\r) — overwrites current line from start
 * - Strips cursor movement and other CSI sequences gracefully
 */

// Colors matching CLSH_THEME in theme.ts
const ANSI_COLORS: Record<number, string> = {
  30: '#1a1a1a', 31: '#f87171', 32: '#4ade80', 33: '#fbbf24',
  34: '#60a5fa', 35: '#c084fc', 36: '#22d3ee', 37: '#d0d0d0',
  90: '#404040', 91: '#f87171', 92: '#4ade80', 93: '#fbbf24',
  94: '#60a5fa', 95: '#c084fc', 96: '#22d3ee', 97: '#ffffff',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#1a1a1a', 41: '#f87171', 42: '#4ade80', 43: '#fbbf24',
  44: '#60a5fa', 45: '#c084fc', 46: '#22d3ee', 47: '#d0d0d0',
  100: '#404040', 101: '#f87171', 102: '#4ade80', 103: '#fbbf24',
  104: '#60a5fa', 105: '#c084fc', 106: '#22d3ee', 107: '#ffffff',
};

function color256(n: number): string {
  if (n < 8) return ANSI_COLORS[30 + n] ?? '#d0d0d0';
  if (n < 16) return ANSI_COLORS[90 + (n - 8)] ?? '#d0d0d0';
  if (n < 232) {
    const idx = n - 16;
    const r = Math.floor(idx / 36) * 51;
    const g = Math.floor((idx % 36) / 6) * 51;
    const b = (idx % 6) * 51;
    return `rgb(${r},${g},${b})`;
  }
  const v = (n - 232) * 10 + 8;
  return `rgb(${v},${v},${v})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Style {
  fg: string | null;
  bg: string | null;
  bold: boolean;
}

function parseSgr(params: number[], style: Style): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i];
    if (p === 0) { style.fg = null; style.bg = null; style.bold = false; }
    else if (p === 1) { style.bold = true; }
    else if (p === 22) { style.bold = false; }
    else if (p === 39) { style.fg = null; }
    else if (p === 49) { style.bg = null; }
    else if (p >= 30 && p <= 37) { style.fg = ANSI_COLORS[p] ?? null; }
    else if (p >= 40 && p <= 47) { style.bg = ANSI_BG_COLORS[p] ?? null; }
    else if (p >= 90 && p <= 97) { style.fg = ANSI_COLORS[p] ?? null; }
    else if (p >= 100 && p <= 107) { style.bg = ANSI_BG_COLORS[p] ?? null; }
    else if (p === 38 && params[i + 1] === 5) { style.fg = color256(params[i + 2] ?? 0); i += 2; }
    else if (p === 48 && params[i + 1] === 5) { style.bg = color256(params[i + 2] ?? 0); i += 2; }
    else if (p === 38 && params[i + 1] === 2) { style.fg = `rgb(${params[i+2]??0},${params[i+3]??0},${params[i+4]??0})`; i += 4; }
    else if (p === 48 && params[i + 1] === 2) { style.bg = `rgb(${params[i+2]??0},${params[i+3]??0},${params[i+4]??0})`; i += 4; }
    i++;
  }
}

function styledSpan(text: string, style: Style): string {
  const escaped = escapeHtml(text);
  const styles: string[] = [];
  if (style.fg) styles.push(`color:${style.fg}`);
  if (style.bg) styles.push(`background:${style.bg}`);
  if (style.bold) styles.push('font-weight:bold');
  return styles.length > 0
    ? `<span style="${styles.join(';')}">${escaped}</span>`
    : escaped;
}

/**
 * Convert raw ANSI text to HTML with colored spans.
 * Uses a simple line-based virtual screen to handle \r and screen clears.
 * Caps output at `maxLines` lines.
 */
export function ansiToHtml(raw: string, maxLines = 30): string {
  // If there's a screen clear or alternate screen buffer, only use content after the last one
  const clearPatterns = ['\x1b[2J', '\x1b[H', '\x1b[?1049h'];
  let startFrom = 0;
  for (const pat of clearPatterns) {
    const idx = raw.lastIndexOf(pat);
    if (idx >= 0) {
      startFrom = Math.max(startFrom, idx + pat.length);
    }
  }
  const input = startFrom > 0 ? raw.slice(startFrom) : raw;

  // Process into lines, handling \r\n and \r (carriage return overwrites)
  const style: Style = { fg: null, bg: null, bold: false };
  const lines: string[][] = [[]]; // array of lines, each line is array of HTML fragments

  // Regex for all CSI sequences including DEC private mode (\x1b[?...)
  // eslint-disable-next-line no-control-regex
  const csiRegex = /\x1b\[([?!>]?[\d;]*?)([A-Za-z])/g;
  // Also match OSC, other escapes, and control chars between CSI sequences
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = csiRegex.exec(input)) !== null) {
    // Process text between last match and this CSI
    const between = input.slice(lastIdx, m.index);
    if (between) {
      processText(between, style, lines);
    }
    lastIdx = m.index + m[0].length;

    const rawParams = m[1] ?? '';
    const code = m[2];

    // Only parse SGR (code 'm') with numeric params — skip DEC private mode (?), etc.
    if (code === 'm' && !rawParams.startsWith('?')) {
      const params = rawParams ? rawParams.split(';').map(Number) : [0];
      parseSgr(params, style);
    }
    // All other CSI sequences (cursor movement, DEC private mode, etc.) — just skip
  }

  // Remaining text
  const tail = input.slice(lastIdx);
  if (tail) {
    processText(tail, style, lines);
  }

  // Take last N lines, trim trailing empty lines
  const result = lines.map((frags) => frags.join('')).slice(-maxLines);
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n');
}

function processText(text: string, style: Style, lines: string[][]): void {
  // Strip remaining escape sequences and control chars
  /* eslint-disable no-control-regex */
  const clean = text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC
    .replace(/\x1b[^\x5b\x5d]/g, '') // other 2-byte escapes
    .replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, ''); // control chars except \n \r \t
  /* eslint-enable no-control-regex */

  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    if (ch === '\r' && clean[i + 1] === '\n') {
      // \r\n = new line
      lines.push([]);
      i += 2;
    } else if (ch === '\n') {
      lines.push([]);
      i++;
    } else if (ch === '\r') {
      // Carriage return: overwrite current line from start
      lines[lines.length - 1] = [];
      i++;
    } else {
      // Collect a run of normal characters
      let end = i + 1;
      while (end < clean.length && clean[end] !== '\r' && clean[end] !== '\n') {
        end++;
      }
      const chunk = clean.slice(i, end);
      lines[lines.length - 1].push(styledSpan(chunk, style));
      i = end;
    }
  }
}
