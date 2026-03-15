/**
 * Pre-scripted terminal sequences for the shell and tmux panes.
 *
 * These scripts drive the demo mode animation that plays when no
 * backend is reachable, giving visitors a realistic preview of clsh.
 */

import type { DemoScript } from './demo-engine';

// ── ANSI helpers ────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BRIGHT_GREEN = '\x1b[92m';
const WHITE = '\x1b[97m';
const RED = '\x1b[31m';

// ── Prompt ──────────────────────────────────────────────────────────
const PROMPT = `${BOLD}${GREEN}dev${RESET}${DIM}@${RESET}${BOLD}${CYAN}macbook${RESET}${DIM}:${RESET}${BOLD}${YELLOW}~/projects/my-app${RESET}${WHITE}$ ${RESET}`;

// ── Shell pane script ───────────────────────────────────────────────
export const shellScript: DemoScript = {
  steps: [
    // Initial prompt with a small startup delay
    { delay: 800, output: PROMPT },

    // cd ~/projects/my-app
    { delay: 200, type: 'cd ~/projects/my-app', speed: 45 },
    { delay: 300, output: '\r\n' + PROMPT },

    // ls -la
    { delay: 600, type: 'ls -la', speed: 55 },
    {
      delay: 200,
      output: [
        '',
        `${BOLD}total 128${RESET}`,
        `drwxr-xr-x  12 dev  staff    384 Mar 12 10:30 ${BOLD}${CYAN}.${RESET}`,
        `drwxr-xr-x   8 dev  staff    256 Mar 10 09:15 ${BOLD}${CYAN}..${RESET}`,
        `-rw-r--r--   1 dev  staff    524 Mar 12 10:30 ${DIM}.gitignore${RESET}`,
        `-rw-r--r--   1 dev  staff    245 Mar 12 10:30 package.json`,
        `-rw-r--r--   1 dev  staff   1024 Mar 12 10:28 tsconfig.json`,
        `-rw-r--r--   1 dev  staff    892 Mar 12 10:30 vite.config.ts`,
        `drwxr-xr-x   5 dev  staff    160 Mar 12 10:30 ${BOLD}${CYAN}src${RESET}`,
        `drwxr-xr-x 412 dev  staff  13184 Mar 11 15:22 ${DIM}node_modules${RESET}`,
        `drwxr-xr-x   3 dev  staff     96 Mar 12 10:30 ${BOLD}${CYAN}dist${RESET}`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // npm run build
    { delay: 800, type: 'npm run build', speed: 48 },
    {
      delay: 400,
      output: [
        '',
        `${DIM}> my-app@1.0.0 build${RESET}`,
        `${DIM}> tsc && vite build${RESET}`,
        '',
        `${CYAN}vite v6.0.0 ${DIM}building for production...${RESET}`,
        `${GREEN}✓${RESET} 42 modules transformed.`,
        `dist/index.html          ${DIM}0.6 kB${RESET}`,
        `dist/assets/index.js   ${BOLD}145.2 kB${RESET} ${DIM}│ gzip: 46.8 kB${RESET}`,
        `dist/assets/index.css    ${DIM}12.4 kB${RESET} ${DIM}│ gzip:  3.1 kB${RESET}`,
        `${GREEN}✓${RESET} built in ${BOLD}823ms${RESET}`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // git status
    { delay: 1000, type: 'git status', speed: 50 },
    {
      delay: 300,
      output: [
        '',
        `On branch ${GREEN}main${RESET}`,
        `Changes not staged for commit:`,
        `  ${DIM}(use "git add <file>..." to update what will be committed)${RESET}`,
        '',
        `\t${RED}modified:   src/App.tsx${RESET}`,
        `\t${RED}modified:   src/hooks/useData.ts${RESET}`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // git add + commit
    { delay: 900, type: 'git add -A && git commit -m "feat: add data fetching hook"', speed: 40 },
    {
      delay: 500,
      output: [
        '',
        `[${GREEN}main ${YELLOW}a1b2c3d${RESET}] feat: add data fetching hook`,
        ` 2 files changed, ${GREEN}45 insertions(+)${RESET}, ${RED}12 deletions(-)${RESET}`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // npm test
    { delay: 1200, type: 'npm test', speed: 52 },
    {
      delay: 600,
      output: [
        '',
        `${DIM}> my-app@1.0.0 test${RESET}`,
        `${DIM}> vitest run${RESET}`,
        '',
        ` ${GREEN}✓${RESET} src/hooks/useData.test.ts ${DIM}(3 tests)${RESET} ${DIM}12ms${RESET}`,
        ` ${GREEN}✓${RESET} src/App.test.tsx ${DIM}(5 tests)${RESET} ${DIM}45ms${RESET}`,
        ` ${GREEN}✓${RESET} src/utils/format.test.ts ${DIM}(8 tests)${RESET} ${DIM}8ms${RESET}`,
        '',
        ` ${BOLD}${BRIGHT_GREEN}Test Files${RESET}  3 passed (3)`,
        ` ${BOLD}${BRIGHT_GREEN}     Tests${RESET}  16 passed (16)`,
        ` ${DIM}  Start at${RESET}  10:31:15`,
        ` ${DIM} Duration${RESET}  1.23s`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // git push
    { delay: 800, type: 'git push origin main', speed: 46 },
    {
      delay: 800,
      output: [
        '',
        `Enumerating objects: 8, done.`,
        `Counting objects: 100% (8/8), done.`,
        `Delta compression using up to 10 threads`,
        `Compressing objects: 100% (4/4), done.`,
        `Writing objects: 100% (5/5), 1.24 KiB | 1.24 MiB/s, done.`,
        `Total 5 (delta 3), reused 0 (delta 0), pack-reused 0`,
        `To github.com:dev/my-app.git`,
        `   ${YELLOW}e4f5g6h${RESET}..${GREEN}a1b2c3d${RESET}  main -> main`,
        '',
      ].join('\r\n'),
    },
    { delay: 100, output: PROMPT },

    // Cursor blink pause before loop restarts
    { delay: 2000, output: '' },
  ],
  loop: true,
  loopDelay: 4000,
};

// ── tmux pane script ────────────────────────────────────────────────
const TMUX_PROMPT = `${BOLD}${GREEN}dev${RESET}${DIM}@${RESET}${BOLD}${CYAN}macbook${RESET}${WHITE}$ ${RESET}`;

/** Generate a timestamp string like [HH:MM:SS] */
function ts(h: number, m: number, s: number): string {
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${DIM}[${hh}:${mm}:${ss}]${RESET}`;
}

const HTTP_METHODS: Record<string, string> = {
  GET: `${GREEN}GET${RESET}`,
  POST: `${YELLOW}POST${RESET}`,
  PUT: `${YELLOW}PUT${RESET}`,
  DELETE: `${RED}DELETE${RESET}`,
};

function httpLog(
  h: number,
  m: number,
  s: number,
  method: string,
  path: string,
  status: number,
  ms: number,
): string {
  const statusColor = status < 300 ? GREEN : status < 400 ? YELLOW : RED;
  return `${ts(h, m, s)} ${HTTP_METHODS[method] ?? method} ${CYAN}${path}${RESET} ${statusColor}${status}${RESET} ${DIM}${ms}ms${RESET}`;
}

export const tmuxScript: DemoScript = {
  steps: [
    // Startup
    { delay: 600, output: TMUX_PROMPT },
    { delay: 300, type: 'npx clsh-dev', speed: 50 },
    {
      delay: 400,
      output: [
        '',
        `${DIM}> my-app@1.0.0 dev${RESET}`,
        `${DIM}> node server.js${RESET}`,
        '',
        `${GREEN}✓${RESET} ${BOLD}Server listening${RESET} on ${CYAN}http://localhost:3000${RESET}`,
        `${DIM}  Press Ctrl+C to stop${RESET}`,
        '',
      ].join('\r\n'),
    },

    // Stream of HTTP log entries
    { delay: 1200, output: httpLog(10, 30, 5, 'GET', '/api/health', 200, 2) + '\r\n' },
    { delay: 2500, output: httpLog(10, 30, 12, 'GET', '/api/users', 200, 45) + '\r\n' },
    { delay: 1800, output: httpLog(10, 30, 15, 'POST', '/api/users', 201, 120) + '\r\n' },
    { delay: 2200, output: httpLog(10, 30, 22, 'GET', '/api/users/1', 200, 8) + '\r\n' },
    {
      delay: 1500,
      output:
        `${ts(10, 30, 28)} ${BRIGHT_GREEN}WebSocket${RESET} connection established ${DIM}(client: ws://localhost:3000)${RESET}\r\n`,
    },
    { delay: 2800, output: httpLog(10, 30, 35, 'GET', '/api/dashboard', 200, 230) + '\r\n' },
    { delay: 1600, output: httpLog(10, 30, 38, 'GET', '/api/users/1/settings', 200, 15) + '\r\n' },
    { delay: 3200, output: httpLog(10, 30, 45, 'PUT', '/api/users/1/settings', 200, 89) + '\r\n' },
    { delay: 1400, output: httpLog(10, 30, 48, 'GET', '/api/notifications', 200, 32) + '\r\n' },
    { delay: 2600, output: httpLog(10, 31, 2, 'POST', '/api/events', 201, 55) + '\r\n' },
    { delay: 1800, output: httpLog(10, 31, 8, 'GET', '/api/health', 200, 1) + '\r\n' },
    {
      delay: 2000,
      output: `${ts(10, 31, 12)} ${YELLOW}WARN${RESET} Slow query detected: ${DIM}getUserDashboard took 450ms${RESET}\r\n`,
    },
    { delay: 1500, output: httpLog(10, 31, 15, 'GET', '/api/dashboard', 200, 450) + '\r\n' },
    { delay: 2400, output: httpLog(10, 31, 22, 'DELETE', '/api/notifications/5', 204, 12) + '\r\n' },
    { delay: 1700, output: httpLog(10, 31, 28, 'GET', '/api/users', 200, 38) + '\r\n' },
    {
      delay: 2200,
      output: `${ts(10, 31, 35)} ${GREEN}INFO${RESET} Cache refreshed: ${DIM}users (15 entries)${RESET}\r\n`,
    },
    { delay: 1800, output: httpLog(10, 31, 40, 'POST', '/api/auth/refresh', 200, 22) + '\r\n' },
    { delay: 2500, output: httpLog(10, 31, 48, 'GET', '/api/users/2', 200, 5) + '\r\n' },
    { delay: 1300, output: httpLog(10, 31, 52, 'GET', '/api/health', 200, 1) + '\r\n' },

    // Pause before loop
    { delay: 3000, output: '' },
  ],
  loop: true,
  loopDelay: 2000,
};
