#!/usr/bin/env bash
set -euo pipefail

RESULTS_FILE="e2e/test-results/results.json"
MARKER="<!-- e2e-results -->"

# Find PR number from the deployment ref
PR_NUMBER=$(gh pr list --head "$DEPLOYMENT_REF" --json number --jq '.[0].number' 2>/dev/null || echo "")

if [ -z "$PR_NUMBER" ]; then
  echo "No PR found for ref $DEPLOYMENT_REF — skipping comment"
  exit 0
fi

# Parse test results
if [ ! -f "$RESULTS_FILE" ]; then
  BODY="${MARKER}
## 🎭 E2E Test Results

**Status:** ⚠️ Results file not found
**Preview:** ${DEPLOYMENT_URL}

Test results JSON was not generated. Check the workflow logs."
  gh pr comment "$PR_NUMBER" --body "$BODY"
  exit 0
fi

# Extract stats from Playwright JSON report
TOTAL=$(jq '.stats.expected + .stats.unexpected + .stats.flaky + .stats.skipped' "$RESULTS_FILE" 2>/dev/null || echo 0)
PASSED=$(jq '.stats.expected' "$RESULTS_FILE" 2>/dev/null || echo 0)
FAILED=$(jq '.stats.unexpected' "$RESULTS_FILE" 2>/dev/null || echo 0)
FLAKY=$(jq '.stats.flaky' "$RESULTS_FILE" 2>/dev/null || echo 0)
SKIPPED=$(jq '.stats.skipped' "$RESULTS_FILE" 2>/dev/null || echo 0)
DURATION_MS=$(jq '.stats.duration | floor' "$RESULTS_FILE" 2>/dev/null || echo 0)
DURATION_S=$(( DURATION_MS / 1000 ))
DURATION_M=$(( DURATION_S / 60 ))
DURATION_REMAINDER=$(( DURATION_S % 60 ))

if [ "$FAILED" -eq 0 ]; then
  STATUS_ICON="✅"
  STATUS_TEXT="$PASSED/$TOTAL passed"
else
  STATUS_ICON="❌"
  STATUS_TEXT="$PASSED/$TOTAL passed, $FAILED failed"
fi

# Check for visual diffs
VISUAL_DIFFS=$(find e2e/test-results -name '*-diff.png' 2>/dev/null | wc -l | tr -d ' ')
VISUAL_TOTAL=$(find e2e/test-results -name '*-expected.png' 2>/dev/null | wc -l | tr -d ' ')
if [ "$VISUAL_DIFFS" -eq 0 ] && [ "$VISUAL_TOTAL" -gt 0 ]; then
  VISUAL_STATUS="✅ $VISUAL_TOTAL/$VISUAL_TOTAL screenshots match baseline"
elif [ "$VISUAL_DIFFS" -gt 0 ]; then
  VISUAL_MATCH=$(( VISUAL_TOTAL - VISUAL_DIFFS ))
  VISUAL_STATUS="⚠️ $VISUAL_MATCH/$VISUAL_TOTAL match, $VISUAL_DIFFS diff(s) detected"
else
  VISUAL_STATUS="No visual tests ran"
fi

# Build failure table
FAILURE_TABLE=""
if [ "$FAILED" -gt 0 ]; then
  FAILURE_TABLE="
### Failures
| Test | Browser | Error |
|------|---------|-------|"
  FAILURE_ROWS=$(jq -r '
    .suites[]?.suites[]?.specs[]? |
    select(.tests[]?.results[]?.status == "unexpected") |
    .tests[] |
    select(.results[]?.status == "unexpected") |
    "| \(.title) | \(.projectName) | \(.results[0].error.message // "Unknown error" | split("\n")[0] | .[0:80]) |"
  ' "$RESULTS_FILE" 2>/dev/null || echo "| (could not parse failures) | - | - |")
  FAILURE_TABLE="$FAILURE_TABLE
$FAILURE_ROWS"
fi

# Build the comment
BODY="${MARKER}
## 🎭 E2E Test Results

**Status:** ${STATUS_ICON} ${STATUS_TEXT}
**Preview:** ${DEPLOYMENT_URL}
**Duration:** ${DURATION_M}m ${DURATION_REMAINDER}s | **Browsers:** Chromium, Firefox, WebKit
${FAILURE_TABLE}

### Visual Regression
${VISUAL_STATUS}

📎 [Full Report with Screenshots](${REPORT_URL:-https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID}) · [CI Run](https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)"

# Check if we already posted a comment on this PR
EXISTING=$(gh pr view "$PR_NUMBER" --json comments --jq ".comments[] | select(.body | contains(\"$MARKER\")) | .id" 2>/dev/null | head -1 || echo "")

if [ -n "$EXISTING" ]; then
  gh api "repos/$GITHUB_REPOSITORY/issues/comments/$EXISTING" -X PATCH -f body="$BODY"
else
  gh pr comment "$PR_NUMBER" --body "$BODY"
fi

echo "Posted E2E results to PR #$PR_NUMBER"
