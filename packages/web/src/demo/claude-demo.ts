/**
 * Detailed Claude Code demo script with ANSI box-drawing and realistic styling.
 *
 * This script simulates a convincing Claude Code session with syntax-highlighted
 * diffs, thinking indicators, and tool-use output.
 */

import type { DemoScript } from './demo-engine';

// ── ANSI codes ──────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[97m';
const RED = '\x1b[31m';
const BG_DIM = '\x1b[48;5;236m';

// ── Box drawing helpers ─────────────────────────────────────────────
const TOP_LEFT = '\u256D';
const TOP_RIGHT = '\u256E';
const BOTTOM_LEFT = '\u2570';
const BOTTOM_RIGHT = '\u256F';
const HORIZONTAL = '\u2500';
const VERTICAL = '\u2502';

function boxLine(width: number): string {
  return HORIZONTAL.repeat(width);
}

function boxTop(width: number): string {
  return `${DIM}${TOP_LEFT}${boxLine(width)}${TOP_RIGHT}${RESET}`;
}

function boxBottom(width: number): string {
  return `${DIM}${BOTTOM_LEFT}${boxLine(width)}${BOTTOM_RIGHT}${RESET}`;
}

function boxRow(content: string, width: number, rawLength: number): string {
  const padding = Math.max(0, width - rawLength);
  return `${DIM}${VERTICAL}${RESET} ${content}${' '.repeat(padding)}${DIM}${VERTICAL}${RESET}`;
}

// ── Build the script ────────────────────────────────────────────────
const BOX_WIDTH = 44;

const header = [
  boxTop(BOX_WIDTH),
  boxRow(
    `${BOLD}${MAGENTA}  Claude Code${RESET}${DIM}                     v1.0.2${RESET}`,
    BOX_WIDTH,
    // Raw visible length: "  Claude Code                     v1.0.2" = 42
    42,
  ),
  boxBottom(BOX_WIDTH),
  '',
].join('\r\n');

const prompt = `${DIM}>${RESET} `;

const userQuery = 'Help me refactor the useData hook to support caching';

const thinkingDots = `\r\n${DIM}${ITALIC}  Thinking...${RESET}\r\n`;

const response1 = [
  '',
  `${BOLD}${WHITE}I'll refactor your useData hook to add a caching layer.${RESET}`,
  `${BOLD}${WHITE}Here's my plan:${RESET}`,
  '',
  `  ${YELLOW}1.${RESET} Add an in-memory cache ${CYAN}Map${RESET}`,
  `  ${YELLOW}2.${RESET} Check cache before fetching`,
  `  ${YELLOW}3.${RESET} Add cache invalidation with TTL`,
  `  ${YELLOW}4.${RESET} Support manual cache clearing`,
  '',
  `${DIM}Let me update the file:${RESET}`,
  '',
].join('\r\n');

const fileEdit = [
  `${BG_DIM} ${BOLD}${CYAN}src/hooks/useData.ts${RESET}${BG_DIM}                        ${RESET}`,
  '',
  `  ${DIM}1${RESET}  ${MAGENTA}import${RESET} { ${CYAN}useState${RESET}, ${CYAN}useEffect${RESET}, ${CYAN}useCallback${RESET} } ${MAGENTA}from${RESET} ${GREEN}'react'${RESET};`,
  `${GREEN}+ ${DIM}2${RESET}  ${MAGENTA}import${RESET} { ${CYAN}useRef${RESET} } ${MAGENTA}from${RESET} ${GREEN}'react'${RESET};${RESET}`,
  `  ${DIM}3${RESET}`,
  `${GREEN}+ ${DIM}4${RESET}  ${MAGENTA}interface${RESET} ${CYAN}CacheEntry${RESET} {${RESET}`,
  `${GREEN}+ ${DIM}5${RESET}    ${CYAN}data${RESET}: ${BLUE}unknown${RESET};${RESET}`,
  `${GREEN}+ ${DIM}6${RESET}    ${CYAN}timestamp${RESET}: ${BLUE}number${RESET};${RESET}`,
  `${GREEN}+ ${DIM}7${RESET}  }${RESET}`,
  `${GREEN}+ ${DIM}8${RESET}${RESET}`,
  `${GREEN}+ ${DIM}9${RESET}  ${MAGENTA}const${RESET} ${CYAN}CACHE_TTL${RESET} = ${YELLOW}5 * 60 * 1000${RESET}; ${DIM}// 5 minutes${RESET}${RESET}`,
  `${GREEN}+${DIM}10${RESET}  ${MAGENTA}const${RESET} ${CYAN}cache${RESET} = ${MAGENTA}new${RESET} ${CYAN}Map${RESET}<${BLUE}string${RESET}, ${CYAN}CacheEntry${RESET}>();${RESET}`,
  `  ${DIM}11${RESET}`,
  `  ${DIM}12${RESET}  ${MAGENTA}export function${RESET} ${YELLOW}useData${RESET}(${CYAN}url${RESET}: ${BLUE}string${RESET}) {`,
  `${RED}- ${DIM}13${RESET}    ${MAGENTA}const${RESET} [${CYAN}data${RESET}, ${CYAN}setData${RESET}] = ${YELLOW}useState${RESET}(${BLUE}null${RESET});${RESET}`,
  `${GREEN}+ ${DIM}13${RESET}    ${MAGENTA}const${RESET} [${CYAN}data${RESET}, ${CYAN}setData${RESET}] = ${YELLOW}useState${RESET}(() => {${RESET}`,
  `${GREEN}+ ${DIM}14${RESET}      ${MAGENTA}const${RESET} ${CYAN}cached${RESET} = cache.${YELLOW}get${RESET}(url);${RESET}`,
  `${GREEN}+ ${DIM}15${RESET}      ${MAGENTA}if${RESET} (cached && Date.${YELLOW}now${RESET}() - cached.timestamp < ${CYAN}CACHE_TTL${RESET})${RESET}`,
  `${GREEN}+ ${DIM}16${RESET}        ${MAGENTA}return${RESET} cached.data;${RESET}`,
  `${GREEN}+ ${DIM}17${RESET}      ${MAGENTA}return${RESET} ${BLUE}null${RESET};${RESET}`,
  `${GREEN}+ ${DIM}18${RESET}    });${RESET}`,
  '',
].join('\r\n');

const toolOutput = [
  `${GREEN}${BOLD}  ✓${RESET} ${DIM}File updated successfully${RESET}`,
  '',
].join('\r\n');

const response2 = [
  `${BOLD}${WHITE}The hook now caches responses for 5 minutes. Key changes:${RESET}`,
  '',
  `  ${GREEN}+${RESET} Responses are stored in a module-level ${CYAN}Map${RESET}`,
  `  ${GREEN}+${RESET} Cache is checked before making network requests`,
  `  ${GREEN}+${RESET} Stale entries (> 5min) are automatically bypassed`,
  `  ${GREEN}+${RESET} ${CYAN}clearCache()${RESET} exported for manual invalidation`,
  '',
  `${DIM}Want me to add cache invalidation on mutation?${RESET}`,
  '',
].join('\r\n');

const prompt2Query = 'Yes, also add error handling and a loading state';

const thinkingDots2 = `\r\n${DIM}${ITALIC}  Analyzing src/hooks/useData.ts...${RESET}\r\n`;

const response3 = [
  '',
  `${BOLD}${WHITE}I'll enhance the hook with error handling and loading state.${RESET}`,
  '',
  `${DIM}Updating the file:${RESET}`,
  '',
].join('\r\n');

const fileEdit2 = [
  `${BG_DIM} ${BOLD}${CYAN}src/hooks/useData.ts${RESET}${BG_DIM}                        ${RESET}`,
  '',
  `${GREEN}+ ${DIM}20${RESET}  ${MAGENTA}const${RESET} [${CYAN}loading${RESET}, ${CYAN}setLoading${RESET}] = ${YELLOW}useState${RESET}(!cached);${RESET}`,
  `${GREEN}+ ${DIM}21${RESET}  ${MAGENTA}const${RESET} [${CYAN}error${RESET}, ${CYAN}setError${RESET}] = ${YELLOW}useState${RESET}<${BLUE}Error${RESET} | ${BLUE}null${RESET}>(${BLUE}null${RESET});${RESET}`,
  `  ${DIM}22${RESET}`,
  `  ${DIM}23${RESET}  ${YELLOW}useEffect${RESET}(() => {`,
  `${GREEN}+ ${DIM}24${RESET}    ${MAGENTA}const${RESET} ${CYAN}controller${RESET} = ${MAGENTA}new${RESET} ${CYAN}AbortController${RESET}();${RESET}`,
  `${GREEN}+ ${DIM}25${RESET}    ${CYAN}setLoading${RESET}(${BLUE}true${RESET});${RESET}`,
  `${GREEN}+ ${DIM}26${RESET}    ${CYAN}setError${RESET}(${BLUE}null${RESET});${RESET}`,
  `  ${DIM}27${RESET}`,
  `  ${DIM}28${RESET}    ${YELLOW}fetch${RESET}(url, { signal: controller.signal })`,
  `${GREEN}+ ${DIM}29${RESET}      .${YELLOW}then${RESET}(${CYAN}res${RESET} => {${RESET}`,
  `${GREEN}+ ${DIM}30${RESET}        ${MAGENTA}if${RESET} (!res.ok) ${MAGENTA}throw new${RESET} ${CYAN}Error${RESET}(res.statusText);${RESET}`,
  `${GREEN}+ ${DIM}31${RESET}        ${MAGENTA}return${RESET} res.${YELLOW}json${RESET}();${RESET}`,
  `${GREEN}+ ${DIM}32${RESET}      })${RESET}`,
  `  ${DIM}33${RESET}      .${YELLOW}then${RESET}(${CYAN}json${RESET} => {`,
  `${GREEN}+ ${DIM}34${RESET}        cache.${YELLOW}set${RESET}(url, { data: json, timestamp: Date.${YELLOW}now${RESET}() });${RESET}`,
  `  ${DIM}35${RESET}        ${CYAN}setData${RESET}(json);`,
  `  ${DIM}36${RESET}      })`,
  `${RED}- ${DIM}37${RESET}      .${YELLOW}catch${RESET}(${CYAN}console${RESET}.error);${RESET}`,
  `${GREEN}+ ${DIM}37${RESET}      .${YELLOW}catch${RESET}(${CYAN}err${RESET} => {${RESET}`,
  `${GREEN}+ ${DIM}38${RESET}        ${MAGENTA}if${RESET} (err.name !== ${GREEN}'AbortError'${RESET}) ${CYAN}setError${RESET}(err);${RESET}`,
  `${GREEN}+ ${DIM}39${RESET}      })${RESET}`,
  `${GREEN}+ ${DIM}40${RESET}      .${YELLOW}finally${RESET}(() => ${CYAN}setLoading${RESET}(${BLUE}false${RESET}));${RESET}`,
  '',
].join('\r\n');

const toolOutput2 = [
  `${GREEN}${BOLD}  ✓${RESET} ${DIM}File updated successfully${RESET}`,
  '',
].join('\r\n');

const response4 = [
  `${BOLD}${WHITE}Done! The hook now returns:${RESET}`,
  '',
  `  ${CYAN}{ data, loading, error, refetch, clearCache }${RESET}`,
  '',
  `  ${GREEN}+${RESET} ${BOLD}loading${RESET} state during fetch`,
  `  ${GREEN}+${RESET} ${BOLD}error${RESET} state with proper ${CYAN}Error${RESET} objects`,
  `  ${GREEN}+${RESET} ${BOLD}AbortController${RESET} cleanup on unmount`,
  `  ${GREEN}+${RESET} ${BOLD}refetch()${RESET} to force cache bypass`,
  `  ${GREEN}+${RESET} ${BOLD}clearCache()${RESET} for mutation invalidation`,
  '',
  `${DIM}Shall I write tests for the new caching behavior?${RESET}`,
  '',
].join('\r\n');

export const claudeCodeScript: DemoScript = {
  steps: [
    // Render header
    { delay: 500, output: header },

    // User prompt
    { delay: 800, output: prompt },
    { delay: 400, type: userQuery, speed: 35 },
    { delay: 600, output: '\r\n' },

    // Thinking
    { delay: 300, output: thinkingDots },

    // Response part 1
    { delay: 1800, output: response1 },

    // File diff
    { delay: 600, output: fileEdit },

    // Tool confirmation
    { delay: 400, output: toolOutput },

    // Response part 2
    { delay: 300, output: response2 },

    // Second user prompt
    { delay: 2000, output: prompt },
    { delay: 500, type: prompt2Query, speed: 32 },
    { delay: 600, output: '\r\n' },

    // Second thinking
    { delay: 300, output: thinkingDots2 },

    // Response part 3
    { delay: 2200, output: response3 },

    // File diff 2
    { delay: 600, output: fileEdit2 },

    // Tool confirmation 2
    { delay: 400, output: toolOutput2 },

    // Final response
    { delay: 300, output: response4 },

    // Pause before loop
    { delay: 3000, output: '' },
  ],
  loop: true,
  loopDelay: 5000,
};
