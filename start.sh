#!/bin/bash
set -e

# ── Tailscale ──
if ! pgrep -x tailscaled > /dev/null; then
    echo "Starting Tailscale daemon..."
    sudo tailscaled --tun=userspace-networking &>/dev/null &
    sleep 2
    # Make socket accessible to non-root so tailscale serve works without sudo
    sudo chmod 666 /run/tailscale/tailscaled.sock 2>/dev/null || true
fi

# ── Node (fnm or nvm or system) ──
if [ -d "$HOME/.local/share/fnm" ]; then
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env --shell bash)"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
elif command -v node &>/dev/null; then
    echo "Using system Node: $(node -v)"
else
    echo "ERROR: No Node.js found. Install fnm, nvm, or Node.js in WSL."
    exit 1
fi

# ── Sync code from Windows → WSL native filesystem ──
echo "Syncing code..."
rsync -a --delete --exclude node_modules --exclude .git /mnt/d/Dev/clsh/ ~/clsh/

# ── Sync Claude Code state from Windows → WSL ──
# Claude Code stores config in two places:
#   ~/.claude/           (credentials, settings, MCP config)
#   ~/.claude.json       (global state: onboarding, account, feature flags)
# Both must be present or Claude shows the first-run wizard → OAuth prompt.
WIN_CLAUDE="/mnt/c/Users/Chris/.claude"
WSL_CLAUDE="$HOME/.claude"

# Remove old NTFS symlink if present
if [ -L "$WSL_CLAUDE" ]; then
    echo "Removing NTFS symlink at $WSL_CLAUDE..."
    rm "$WSL_CLAUDE"
fi

mkdir -p "$WSL_CLAUDE"
chmod 700 "$WSL_CLAUDE"

# Sync config files (non-credential files can be overwritten safely)
for f in settings.json settings.local.json .mcp.json; do
    if [ -f "$WIN_CLAUDE/$f" ]; then
        cp "$WIN_CLAUDE/$f" "$WSL_CLAUDE/$f"
        chmod 600 "$WSL_CLAUDE/$f"
    fi
done

# Merge credentials (preserves MCP OAuth tokens from both platforms)
# .credentials.json contains mcpOAuth entries that may differ between Windows
# and WSL — e.g., a token obtained in WSL after "claude mcp add" wouldn't exist
# on Windows. A blind copy would clobber it. Instead, merge mcpOAuth entries
# and keep whichever side has a valid (non-empty) access token.
python3 -c "
import json, os, sys

win_path = '$WIN_CLAUDE/.credentials.json'
wsl_path = '$WSL_CLAUDE/.credentials.json'

win = {}
wsl = {}

if os.path.exists(win_path):
    with open(win_path) as f:
        win = json.load(f)

if os.path.exists(wsl_path):
    with open(wsl_path) as f:
        wsl = json.load(f)

# Start with Windows as base (primary auth source for claudeAiOauth)
merged = dict(win)

# Merge mcpOAuth: keep whichever entry has a valid token
win_mcp = win.get('mcpOAuth', {})
wsl_mcp = wsl.get('mcpOAuth', {})
merged_mcp = {}

all_keys = set(list(win_mcp.keys()) + list(wsl_mcp.keys()))
for key in all_keys:
    w = win_mcp.get(key, {})
    l = wsl_mcp.get(key, {})
    w_token = w.get('accessToken', '') if isinstance(w, dict) else ''
    l_token = l.get('accessToken', '') if isinstance(l, dict) else ''
    w_exp = w.get('expiresAt', 0) if isinstance(w, dict) else 0
    l_exp = l.get('expiresAt', 0) if isinstance(l, dict) else 0

    if l_token and not w_token:
        merged_mcp[key] = l
    elif w_token and not l_token:
        merged_mcp[key] = w
    elif l_token and w_token:
        # Both have tokens — keep the one with later expiry
        merged_mcp[key] = l if (l_exp or 0) > (w_exp or 0) else w
    else:
        # Neither has a token — keep Windows entry (has discoveryState)
        merged_mcp[key] = w if w else l

if merged_mcp:
    merged['mcpOAuth'] = merged_mcp

with open(wsl_path, 'w') as f:
    json.dump(merged, f, indent=2)

# Bi-directional: write back to Windows if WSL had tokens Windows didn't
wrote_back = False
for key in all_keys:
    w_token = win_mcp.get(key, {}).get('accessToken', '') if isinstance(win_mcp.get(key, {}), dict) else ''
    m_token = merged_mcp.get(key, {}).get('accessToken', '') if isinstance(merged_mcp.get(key, {}), dict) else ''
    if m_token and not w_token:
        wrote_back = True
        break

if wrote_back and os.path.exists(win_path):
    win_merged = dict(win)
    win_merged['mcpOAuth'] = merged_mcp
    with open(win_path, 'w') as f:
        json.dump(win_merged, f, indent=2)
    print('  Credentials: synced WSL tokens back to Windows')
"
chmod 600 "$WSL_CLAUDE/.credentials.json"

# Sync global state (~/.claude.json) — merge onboarding flags from Windows
# so Claude Code doesn't re-trigger the first-run wizard
WIN_GLOBAL="/mnt/c/Users/Chris/.claude.json"
WSL_GLOBAL="$HOME/.claude.json"
if [ -f "$WIN_GLOBAL" ]; then
    python3 -c "
import json, sys

with open('$WIN_GLOBAL') as f:
    win = json.load(f)

wsl = {}
if __import__('os').path.exists('$WSL_GLOBAL'):
    with open('$WSL_GLOBAL') as f:
        wsl = json.load(f)

# Merge onboarding + auth state from Windows
for key in ['hasCompletedOnboarding', 'lastOnboardingVersion', 'numStartups',
            'oauthAccount', 'firstStartTime', 'userID', 'installMethod',
            'lastReleaseNotesSeen', 'opusProMigrationComplete',
            'sonnet1m45MigrationComplete', 'thinkingMigrationComplete']:
    if key in win:
        wsl[key] = win[key]

with open('$WSL_GLOBAL', 'w') as f:
    json.dump(wsl, f, indent=2)
"
    chmod 600 "$WSL_GLOBAL"
fi

echo "Claude Code state synced ✓"

# ── Install deps on WSL native filesystem ──
cd ~/clsh
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    echo "Installing dependencies (Linux-native)..."
    npm install
fi

# ── Start clsh ──
export TUNNEL=tailscale
export WEB_PORT=4031

# Run inside a host-level tmux so clsh survives the terminal window closing.
# Kill any stale clsh-server session first — `-A` would silently reattach to a
# dead session, causing the agent to never start (only Vite HMR output visible).
if command -v tmux &>/dev/null && [ -z "$TMUX" ]; then
    tmux kill-session -t clsh-server 2>/dev/null || true
    exec tmux new-session -s clsh-server "npm run dev"
else
    npm run dev
fi
