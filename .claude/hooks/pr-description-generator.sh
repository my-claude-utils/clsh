#!/bin/bash
# Hook: pr-description-generator.sh
# Event: PreToolUse (Bash)
# Purpose: Auto-generate PR description from commits when gh pr create lacks --body

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.command || '')")

# Only trigger on gh pr create without --body
[[ "$COMMAND" != *"gh pr create"* ]] && exit 0
[[ "$COMMAND" == *"--body"* ]] && exit 0

# Get current branch
BRANCH=$(git branch --show-current 2>/dev/null)

# Get commits since branching from main
COMMITS=$(git log main..HEAD --oneline 2>/dev/null | head -10)

# Output context for Claude to generate PR description
cat << EOF
PR_DESCRIPTION_NEEDED:
- Branch: $BRANCH
- Commits:
$COMMITS

Please generate a PR description using this format:
## Summary
<1-3 bullet points based on commits>

## Test Plan
<Checklist based on changes>

Then modify the gh pr create command to include --body with the generated description.
EOF

# Allow the command but provide context
exit 0
