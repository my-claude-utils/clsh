#!/bin/bash
set -e

# ── Tailscale ──
if ! pgrep -x tailscaled > /dev/null; then
    echo "Starting Tailscale daemon..."
    sudo tailscaled --tun=userspace-networking &>/dev/null &
    sleep 2
fi

# ── Node (fnm) ──
export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env --shell bash)"

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

# Sync credentials + config files
for f in .credentials.json settings.json settings.local.json .mcp.json; do
    if [ -f "$WIN_CLAUDE/$f" ]; then
        cp "$WIN_CLAUDE/$f" "$WSL_CLAUDE/$f"
        chmod 600 "$WSL_CLAUDE/$f"
    fi
done

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

# ── Start clsh ──
export TUNNEL=tailscale
export WEB_PORT=4031
cd ~/clsh
npm run dev
