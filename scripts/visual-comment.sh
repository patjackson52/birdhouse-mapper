#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/visual-lib.sh"

RESULTS_DIR="e2e/test-results"
REPORT_DIR="e2e/visual-report"
TEMPLATE="$SCRIPT_DIR/visual-report-template.html"

# Parse arguments
ISSUE=""
TEST_FILTER=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --issue=*) ISSUE="${1#*=}"; shift ;;
    --issue) ISSUE="$2"; shift 2 ;;
    --test=*) TEST_FILTER="${1#*=}"; shift ;;
    --test) TEST_FILTER="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Discover images
discover_images "$RESULTS_DIR" "$TEST_FILTER"

if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo "No visual test results found in $RESULTS_DIR"
  echo "Run visual tests first: npx playwright test --config=e2e/playwright.config.ts e2e/tests/visual/"
  exit 1
fi

SUMMARY=$(build_summary)

# CI mode: post to GitHub issue
if [ -n "$ISSUE" ] && [ -n "${REPORT_URL:-}" ]; then
  IMAGE_BASE_URL="${REPORT_URL}/visual-diffs"
  DIFF_TABLE=$(build_diff_table "$IMAGE_BASE_URL" "$RESULTS_DIR")

  MARKER="<!-- visual-diff-${TEST_FILTER:-all} -->"

  if [ -n "$DIFF_TABLE" ]; then
    BODY="${MARKER}
## 📸 Visual Diff Report
${SUMMARY}

${DIFF_TABLE}

📎 [Full Report](${REPORT_URL})"
  else
    BODY="${MARKER}
## 📸 Visual Diff Report
✅ ${SUMMARY}

📎 [Full Report](${REPORT_URL})"
  fi

  # Check for existing comment with same marker
  REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
  EXISTING=$(gh api "repos/$REPO/issues/$ISSUE/comments" --jq ".[] | select(.body | contains(\"$MARKER\")) | .id" 2>/dev/null | head -1 || echo "")

  if [ -n "$EXISTING" ]; then
    gh api "repos/$REPO/issues/comments/$EXISTING" -X PATCH -f body="$BODY"
    echo "Updated visual diff comment on issue #$ISSUE"
  else
    gh issue comment "$ISSUE" --body "$BODY"
    echo "Posted visual diff comment on issue #$ISSUE"
  fi
  exit 0
fi

# CI mode without REPORT_URL — warn
if [ -n "$ISSUE" ] && [ -z "${REPORT_URL:-}" ]; then
  echo "Warning: --issue requires REPORT_URL to be set (images need to be URL-addressable)"
  echo "Falling back to local report..."
fi

# Local mode: generate HTML report
rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

# Copy images to report directory
for name in "${DIFF_NAMES[@]}"; do
  find "$RESULTS_DIR" -name "${name}-actual.png" -exec cp {} "$REPORT_DIR/" \;
  find "$RESULTS_DIR" -name "${name}-expected.png" -exec cp {} "$REPORT_DIR/" \;
  find "$RESULTS_DIR" -name "${name}-diff.png" -exec cp {} "$REPORT_DIR/" \;
done

for name in "${NEW_NAMES[@]}"; do
  find "$RESULTS_DIR" -name "${name}-actual.png" -exec cp {} "$REPORT_DIR/" \;
done

# Build HTML content
CONTENT=""

CONTENT="$CONTENT<div class=\"summary\">${SUMMARY}</div>"

if [ ${#DIFF_NAMES[@]} -eq 0 ] && [ ${#NEW_NAMES[@]} -eq 0 ]; then
  CONTENT="$CONTENT<div class=\"no-diffs\">All visual tests match their baselines.</div>"
fi

for name in "${DIFF_NAMES[@]}"; do
  CONTENT="$CONTENT
<div class=\"test-card\">
  <h2>${name} <span class=\"badge badge-diff\">DIFF</span></h2>
  <div class=\"images\">
    <figure><figcaption>Expected</figcaption><img src=\"${name}-expected.png\" alt=\"expected\"></figure>
    <figure><figcaption>Actual</figcaption><img src=\"${name}-actual.png\" alt=\"actual\"></figure>
    <figure><figcaption>Diff</figcaption><img src=\"${name}-diff.png\" alt=\"diff\"></figure>
  </div>
</div>"
done

for name in "${NEW_NAMES[@]}"; do
  CONTENT="$CONTENT
<div class=\"test-card\">
  <h2>${name} <span class=\"badge badge-new\">NEW</span></h2>
  <div class=\"images\">
    <figure><figcaption>Actual (no baseline)</figcaption><img src=\"${name}-actual.png\" alt=\"actual\"></figure>
  </div>
</div>"
done

# Generate HTML from template — split on placeholder, insert content between halves
{
  head -n "$(grep -n '{{CONTENT}}' "$TEMPLATE" | cut -d: -f1 | head -1)" "$TEMPLATE" | sed '$ d'
  echo "$CONTENT"
  tail -n +"$(($(grep -n '{{CONTENT}}' "$TEMPLATE" | cut -d: -f1 | head -1) + 1))" "$TEMPLATE"
} > "$REPORT_DIR/index.html"

echo "Visual diff report generated at $REPORT_DIR/index.html"
echo "  ${#DIFF_NAMES[@]} diff(s), ${#NEW_NAMES[@]} new, $MATCH_COUNT match"

# Open in browser on macOS
if command -v open &> /dev/null; then
  open "$REPORT_DIR/index.html"
fi
