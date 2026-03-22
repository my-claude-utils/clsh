#!/bin/bash
# Hook: context-reinject.sh
# Event: SessionStart (compact)
# Purpose: Re-inject critical workflow reminders after context compaction

cat << 'EOF'
## Session Resumed - clsh Fork Reminders

### Security Audit Priorities
- P0: Disable biometric auth, fix JWT expiry (30d→8h), add JWT revocation, env var allowlist
- P1: WebSocket connection limit, min password 12, DB permissions (0o600), bootstrap token cleanup

### TDD MANDATORY
- Write test FIRST (RED)
- Implement minimum code (GREEN)
- Refactor while green (REFACTOR)

### Before Committing
```bash
npm run lint && npm run typecheck && npm run test
```

### Branch Workflow
- Feature branches: `fix/{description}` or `feat/{description}`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, etc.
- No direct pushes to main

### Key Files (security fixes)
- `packages/agent/src/auth.ts` — JWT expiry, revocation
- `packages/agent/src/server.ts` — biometric routes, WS limits
- `packages/agent/src/pty-manager.ts` — env var allowlist
- `packages/agent/src/db.ts` — file permissions
- `packages/agent/src/password.ts` — min length, scrypt params
EOF
