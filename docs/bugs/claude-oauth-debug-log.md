# Claude Code OAuth in clsh PTY — Debug Log

## Problem
Running `claude` in a clsh remote PTY session (phone → Tailscale → WSL2) triggers OAuth login instead of using cached credentials.

## Root Cause — CONFIRMED
**Missing `hasCompletedOnboarding` flag in WSL `~/.claude.json`.**

Claude Code stores global state in `~/.claude.json` (NOT inside `~/.claude/` directory). The Windows version has `hasCompletedOnboarding: true` from normal usage. The WSL version was either missing this file or had a fresh copy without the flag.

Without `hasCompletedOnboarding: true`, Claude Code launches the **first-run onboarding wizard** (theme selection → OAuth login), even if valid credentials exist at `~/.claude/.credentials.json`.

## Fix
`start.sh` now merges onboarding flags from Windows `~/.claude.json` into WSL version on every startup. Key fields: `hasCompletedOnboarding`, `lastOnboardingVersion`, `oauthAccount`, `numStartups`.

## Debug Timeline

### Hypothesis 1: NTFS file permissions — DISPROVED
- Theory: NTFS symlink gives 777 perms, Claude Code rejects non-600 credentials
- Test: `claude -p "say hi"` with 777 perms → works fine
- Test: `claude -p "say hi"` with 600 perms → also works fine
- **Conclusion: Permissions are NOT the issue**

### Hypothesis 2: PTY environment missing vars — DISPROVED
- Test: `env -i HOME=/root PATH=... claude -p "say hello"` → works
- Test: Stripped env in interactive mode → works
- **Conclusion: buildSafeEnv filtering is NOT the issue**

### Hypothesis 3: Real PTY vs piped stdin — LED TO ANSWER
- Test: `echo "hi" | claude` → works (no OAuth)
- Test: `script -qc "claude -p ..."` → works (no OAuth)
- Test: `node-pty spawn("claude")` — **showed first-run onboarding wizard!**
- This is what the user sees: onboarding wizard → theme → OAuth login

### Hypothesis 4: Missing onboarding state — CONFIRMED
- Windows `~/.claude.json` has: `hasCompletedOnboarding: true`, `lastOnboardingVersion: "2.1.39"`, `numStartups: 103`
- WSL `~/.claude.json` was missing these fields (created fresh by `-p` test runs)
- After merging `hasCompletedOnboarding: true` → node-pty test shows NO wizard, goes straight to workspace trust dialog
- **This is the root cause**

## Key Insight
Claude Code has TWO config locations:
1. `~/.claude/` — directory with credentials, settings, MCP config
2. `~/.claude.json` — single file with global state (onboarding, account, feature flags)

Both must be properly populated. The original NTFS symlink only covered `~/.claude/` directory. `~/.claude.json` was always a separate native WSL file that never had the onboarding-complete flags.

## Files Changed
- `start.sh` — syncs both `~/.claude/` files AND `~/.claude.json` onboarding state from Windows
- `packages/agent/src/pty-manager.ts` — added `CLAUDE_` prefix to env allowlist (useful but not the fix)
