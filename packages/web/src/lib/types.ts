/**
 * Shared types used across the clsh mobile UI.
 * Import from here to keep all agents aligned on the same interfaces.
 */

// ── Sessions ──────────────────────────────────────────────────────────────────

export type SessionStatus = 'run' | 'idle';
export type ShellType = 'zsh' | 'tmux' | 'claude';

export interface Session {
  id: string;           // server-assigned UUID
  name: string;         // display name (cwd basename, e.g. "clsh" or "api-refactor")
  cwd: string;          // current working directory
  status: SessionStatus;
  shell: ShellType;
  pid: number;
  preview: string;      // last ~3000 chars of raw ANSI output (converted to HTML in SessionCard)
  snapshot?: string;    // xterm visible-screen capture taken when leaving the session
}

// ── Views ─────────────────────────────────────────────────────────────────────

export type View = 'grid' | 'terminal' | 'skin-studio';

// ── Keyboard Skins ────────────────────────────────────────────────────────────

export type SkinId =
  | 'macbook-silver'
  | 'ios-terminal'
  | 'gamer-rgb'
  | 'custom-painted'
  | 'amber-retro'
  | 'ice-white';

export interface SkinDefinition {
  id: SkinId;
  name: string;
  subtitle: string;
  vars: SkinVars;
  animated?: boolean;   // Gamer RGB has CSS animation
}

export interface SkinVars {
  kbdBg: string;
  keyFace: string;
  keyBorder: string;
  keySide: string;        // shadow/bottom-edge color
  keyLabel: string;
  keyLabelShift: string;
  keyHover: string;
  keyActive: string;
}

// Per-key color overrides (Custom Painted + user paint mode)
// Map of keyId → hex color string, stored in localStorage
export type PerKeyColors = Record<string, string>;

// ── Component Props ───────────────────────────────────────────────────────────

export interface GridViewProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  onCloseSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  wsStatus: import('./ws-client').ConnectionStatus;
}

export interface TerminalViewProps {
  session: Session;
  wsClient: import('./ws-client').TerminalWSClient | null;
  messageBus: import('./message-bus').MessageBus;
  getSessionOutput: (sessionId: string) => string[];
  /** Called when user navigates back; snapshot is the xterm screen capture */
  onBack: (snapshot: string) => void;
  onOpenSkinStudio: () => void;
  onOpenSettings: () => void;
  /** Renames the current session */
  onRenameSession: (sessionId: string, name: string) => void;
  skin: SkinId;
  perKeyColors: PerKeyColors;
}

export interface MacBookKeyboardProps {
  onKey: (data: string) => void;    // sends escape sequence or char to terminal
  skin: SkinId;
  perKeyColors: PerKeyColors;
  onOpenSkinStudio?: () => void;
}

export interface ContextStripProps {
  onKey: (data: string) => void;
}

export interface SkinStudioProps {
  currentSkin: SkinId;
  onSkinChange: (skin: SkinId) => void;
  perKeyColors: PerKeyColors;
  onPerKeyColorChange: (colors: PerKeyColors) => void;
  onClose: () => void;
}
