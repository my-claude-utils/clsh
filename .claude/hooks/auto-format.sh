#!/bin/bash
# Hook: auto-format.sh
# Event: PostToolUse (Edit|Write)
# Purpose: Auto-format TypeScript files after Claude edits them

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.file_path || '')")

# Only format TypeScript files
[[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.tsx ]] && exit 0

# Skip if file doesn't exist (was deleted)
[[ ! -f "$FILE_PATH" ]] && exit 0

# Run prettier (suppress errors, don't fail the hook)
npx prettier --write "$FILE_PATH" 2>/dev/null || true

exit 0
