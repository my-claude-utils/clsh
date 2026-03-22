#!/bin/bash
# Hook: quality-gate.sh
# Event: Stop
# Purpose: Verify lint, typecheck, and tests pass before Claude considers work complete

INPUT=$(cat)

# Skip if this is a stop hook re-firing
STOP_HOOK_ACTIVE=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.stop_hook_active || false)")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

FAILED=0

echo "Running quality gate checks..."

LINT_OUTPUT=$(npm run lint 2>&1)
LINT_EXIT=$?

TYPECHECK_OUTPUT=$(npm run typecheck 2>&1)
TYPECHECK_EXIT=$?

TEST_OUTPUT=$(npm run test 2>&1)
TEST_EXIT=$?

if [ $LINT_EXIT -ne 0 ] || [ $TYPECHECK_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
  FAILED=1
fi

# Report failures
if [ $FAILED -ne 0 ]; then
  echo '{"decision": "block"}'
  echo "" >&2
  echo "QUALITY GATE FAILED - Fix these issues before completing:" >&2

  if [ $LINT_EXIT -ne 0 ]; then
    echo "" >&2
    echo "=== LINT ERRORS ===" >&2
    echo "$LINT_OUTPUT" | tail -20 >&2
  fi

  if [ $TYPECHECK_EXIT -ne 0 ]; then
    echo "" >&2
    echo "=== TYPECHECK ERRORS ===" >&2
    echo "$TYPECHECK_OUTPUT" | tail -20 >&2
  fi

  if [ $TEST_EXIT -ne 0 ]; then
    echo "" >&2
    echo "=== TEST FAILURES ===" >&2
    echo "$TEST_OUTPUT" | tail -30 >&2
  fi

  exit 0
fi

echo "Quality gate passed!"
exit 0
