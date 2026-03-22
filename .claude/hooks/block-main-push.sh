#!/bin/bash
# Hook: block-main-push.sh
# Event: PreToolUse (Bash)
# Purpose: Block git push commands targeting main branch

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.command || '')")

# Check for dangerous git commands
if [[ "$COMMAND" == *"git push"* ]]; then
  # Block force push to main
  if [[ "$COMMAND" == *"--force"* || "$COMMAND" == *"-f"* ]]; then
    if [[ "$COMMAND" == *"main"* || "$COMMAND" == *"master"* ]]; then
      echo "BLOCKED: Force push to main/master is not allowed!" >&2
      exit 2
    fi
  fi

  # Block direct push to main (origin main)
  if [[ "$COMMAND" == *"origin main"* || "$COMMAND" == *"origin master"* ]]; then
    echo "BLOCKED: Direct push to main branch is not allowed." >&2
    echo "" >&2
    echo "Use feature branches and PRs:" >&2
    echo "  git checkout -b fix/{description}" >&2
    echo "  git push -u origin HEAD" >&2
    echo "  gh pr create" >&2
    exit 2
  fi
fi

exit 0
