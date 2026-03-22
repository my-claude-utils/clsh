#!/bin/bash
# Hook: protect-files.sh
# Event: PreToolUse (Edit|Write)
# Purpose: Block edits to sensitive/infrastructure files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.file_path || '')")

[[ -z "$FILE_PATH" ]] && exit 0

# Protected patterns
PROTECTED=(
  ".env"
  ".env.local"
  ".env.production"
  "package-lock.json"
  "yarn.lock"
  "pnpm-lock.yaml"
  ".git/"
  ".vercel/"
  "credentials"
  "secrets"
)

for pattern in "${PROTECTED[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: Cannot edit protected file '$FILE_PATH'" >&2
    echo "Pattern matched: '$pattern'" >&2
    echo "" >&2
    echo "If you need to modify this file, ask the user to do it manually." >&2
    exit 2
  fi
done

exit 0
