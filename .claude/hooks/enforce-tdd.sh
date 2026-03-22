#!/bin/bash
# Hook: enforce-tdd.sh
# Event: PreToolUse (Edit|Write)
# Purpose: Block edits to implementation files if no test file exists (TDD enforcement)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.file_path || '')")

# Skip non-source files
[[ -z "$FILE_PATH" ]] && exit 0
[[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.tsx ]] && exit 0

# Allow editing test files (that's what TDD wants!)
[[ "$FILE_PATH" == *"__tests__"* ]] && exit 0
[[ "$FILE_PATH" == *".test."* ]] && exit 0
[[ "$FILE_PATH" == *".spec."* ]] && exit 0

# Allow editing type definitions, configs, mocks
[[ "$FILE_PATH" == *"/types/"* ]] && exit 0
[[ "$FILE_PATH" == *"/types.ts" ]] && exit 0
[[ "$FILE_PATH" == *.config.* ]] && exit 0
[[ "$FILE_PATH" == *"__mocks__"* ]] && exit 0

# Allow CLI package (thin wrapper, no business logic)
[[ "$FILE_PATH" == *"packages/cli/"* ]] && exit 0

# Allow demo files
[[ "$FILE_PATH" == *"/demo/"* ]] && exit 0

# ── Agent package TDD enforcement ──
if [[ "$FILE_PATH" == *"packages/agent/src/"* ]]; then
  DIR=$(dirname "$FILE_PATH")
  BASENAME=$(basename "$FILE_PATH" .ts)
  BASENAME=$(basename "$BASENAME" .tsx)

  # Check pattern 1: co-located test (DIR/BASENAME.test.ts)
  [[ -f "$DIR/$BASENAME.test.ts" || -f "$DIR/$BASENAME.test.tsx" ]] && exit 0

  # Check pattern 2: sibling __tests__ (DIR/__tests__/BASENAME.test.ts)
  [[ -f "$DIR/__tests__/$BASENAME.test.ts" || -f "$DIR/__tests__/$BASENAME.test.tsx" ]] && exit 0

  # Check pattern 3: top-level agent test dir
  AGENT_ROOT="${FILE_PATH%%/packages/agent/*}/packages/agent"
  if [[ -d "$AGENT_ROOT/__tests__" ]]; then
    FOUND=$(find "$AGENT_ROOT/__tests__" -name "$BASENAME.test.ts" -o -name "$BASENAME.test.tsx" 2>/dev/null | head -1)
    [[ -n "$FOUND" ]] && exit 0
  fi
  if [[ -d "$AGENT_ROOT/test" ]]; then
    FOUND=$(find "$AGENT_ROOT/test" -name "$BASENAME.test.ts" -o -name "$BASENAME.test.tsx" 2>/dev/null | head -1)
    [[ -n "$FOUND" ]] && exit 0
  fi

  echo "TDD VIOLATION: Write the test first!" >&2
  echo "" >&2
  echo "No test found for: $FILE_PATH" >&2
  echo "Checked:" >&2
  echo "  - $DIR/$BASENAME.test.ts  (co-located)" >&2
  echo "  - $DIR/__tests__/$BASENAME.test.ts  (sibling)" >&2
  echo "  - $AGENT_ROOT/__tests__/**/$BASENAME.test.ts  (top-level)" >&2
  echo "" >&2
  echo "TDD Workflow:" >&2
  echo "  1. RED: Write test first (it should fail)" >&2
  echo "  2. GREEN: Write minimum code to pass" >&2
  echo "  3. REFACTOR: Clean up while tests stay green" >&2
  exit 2
fi

# ── Web package TDD enforcement ──
if [[ "$FILE_PATH" == *"packages/web/src/"* ]]; then
  FNAME=$(basename "$FILE_PATH")

  # Allow entry points and framework files
  [[ "$FNAME" == "main.tsx" || "$FNAME" == "main.ts" ]] && exit 0
  [[ "$FNAME" == "App.tsx" || "$FNAME" == "App.ts" ]] && exit 0
  [[ "$FNAME" == "vite-env.d.ts" ]] && exit 0

  # Allow lib/ utilities (keyboard layouts, theme, protocol types)
  [[ "$FILE_PATH" == *"/lib/"* ]] && exit 0

  DIR=$(dirname "$FILE_PATH")
  BASENAME=$(basename "$FILE_PATH" .ts)
  BASENAME=$(basename "$BASENAME" .tsx)

  # Check pattern 1: co-located test
  [[ -f "$DIR/$BASENAME.test.ts" || -f "$DIR/$BASENAME.test.tsx" ]] && exit 0

  # Check pattern 2: sibling __tests__
  [[ -f "$DIR/__tests__/$BASENAME.test.ts" || -f "$DIR/__tests__/$BASENAME.test.tsx" ]] && exit 0

  # Check pattern 3: top-level web test dir
  WEB_ROOT="${FILE_PATH%%/packages/web/*}/packages/web"
  if [[ -d "$WEB_ROOT/__tests__" ]]; then
    FOUND=$(find "$WEB_ROOT/__tests__" -name "$BASENAME.test.ts" -o -name "$BASENAME.test.tsx" 2>/dev/null | head -1)
    [[ -n "$FOUND" ]] && exit 0
  fi

  echo "TDD VIOLATION: Write the test first!" >&2
  echo "" >&2
  echo "No test found for: $FILE_PATH" >&2
  echo "Checked:" >&2
  echo "  - $DIR/$BASENAME.test.ts(x)  (co-located)" >&2
  echo "  - $DIR/__tests__/$BASENAME.test.ts(x)  (sibling)" >&2
  echo "  - $WEB_ROOT/__tests__/**/$BASENAME.test.ts(x)  (top-level)" >&2
  echo "" >&2
  echo "TDD Workflow:" >&2
  echo "  1. RED: Write test first (it should fail)" >&2
  echo "  2. GREEN: Write minimum code to pass" >&2
  echo "  3. REFACTOR: Clean up while tests stay green" >&2
  exit 2
fi

exit 0
