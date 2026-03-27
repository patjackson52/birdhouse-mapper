# Visual Diff Report & Issue Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed before/after/diff screenshots inline in PR comments and provide a command to post visual diffs to GitHub issues (CI) or generate a local HTML report (dev).

**Architecture:** Enhance the existing `post-e2e-comment.sh` script to detect and embed diff images using GitHub Pages URLs. Add a new `visual-comment.sh` script that reuses the same image discovery logic and can target GitHub issues (CI) or produce a local HTML report. The CI workflow copies raw diff images into the Pages deploy directory.

**Tech Stack:** Bash scripts, GitHub Pages, GitHub CLI (`gh`), self-contained HTML/CSS

**Spec:** `docs/superpowers/specs/2026-03-27-visual-diff-report-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.gitignore` | Modify | Add `e2e/visual-report/` |
| `package.json` | Modify | Add `visual:comment` script |
| `.github/workflows/e2e.yml` | Modify | Copy diff images before Pages deploy |
| `scripts/visual-lib.sh` | Create | Shared image discovery functions |
| `scripts/post-e2e-comment.sh` | Modify | Embed diff images in PR comment |
| `scripts/visual-comment.sh` | Create | Issue comment (CI) + local report (dev) |
| `scripts/visual-report-template.html` | Create | HTML template for local side-by-side viewer |

---

### Task 1: Shared Image Discovery Library

**Files:**
- Create: `scripts/visual-lib.sh`

This extracts the image discovery logic into a shared file sourced by both scripts.

- [ ] **Step 1: Create `scripts/visual-lib.sh`**

```bash
#!/usr/bin/env bash
# Shared image discovery for visual diff scripts.
# Source this file — do not execute directly.
#
# Usage:
#   source "$(dirname "$0")/visual-lib.sh"
#   discover_images "e2e/test-results" "map-view"  # filtered
#   discover_images "e2e/test-results"              # all
#
# After calling discover_images, these arrays are populated:
#   DIFF_NAMES=()      — test names with mismatches (expected + actual + diff exist)
#   NEW_NAMES=()       — test names with no baseline (actual only)
#   MATCH_COUNT=0      — count of matching screenshots (expected exists, no diff)
#   TOTAL_COUNT=0      — total visual tests found

DIFF_NAMES=()
NEW_NAMES=()
MATCH_COUNT=0
TOTAL_COUNT=0

discover_images() {
  local results_dir="$1"
  local filter="${2:-}"

  DIFF_NAMES=()
  NEW_NAMES=()
  MATCH_COUNT=0
  TOTAL_COUNT=0

  if [ ! -d "$results_dir" ]; then
    return
  fi

  # Find all actual screenshots (Playwright generates these on every visual comparison)
  local actual_files
  actual_files=$(find "$results_dir" -name '*-actual.png' 2>/dev/null | sort)

  for actual in $actual_files; do
    local dir
    dir=$(dirname "$actual")
    local basename
    basename=$(basename "$actual" | sed 's/-actual\.png$//')

    # Apply filter if provided
    if [ -n "$filter" ] && [[ "$basename" != *"$filter"* ]]; then
      continue
    fi

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    local expected="$dir/${basename}-expected.png"
    local diff="$dir/${basename}-diff.png"

    if [ -f "$diff" ] && [ -f "$expected" ]; then
      DIFF_NAMES+=("$basename")
    elif [ ! -f "$expected" ]; then
      NEW_NAMES+=("$basename")
    fi
  done

  # Also count expected-only files (matches) that have no actual (test passed, no diff generated)
  local expected_files
  expected_files=$(find "$results_dir" -name '*-expected.png' 2>/dev/null | sort)

  for expected in $expected_files; do
    local dir
    dir=$(dirname "$expected")
    local basename
    basename=$(basename "$expected" | sed 's/-expected\.png$//')

    if [ -n "$filter" ] && [[ "$basename" != *"$filter"* ]]; then
      continue
    fi

    local actual="$dir/${basename}-actual.png"
    local diff="$dir/${basename}-diff.png"

    # Only count as match if no diff was generated
    if [ ! -f "$diff" ] && [ ! -f "$actual" ]; then
      MATCH_COUNT=$((MATCH_COUNT + 1))
      TOTAL_COUNT=$((TOTAL_COUNT + 1))
    fi
  done
}

# Build a markdown table of visual diffs for GitHub comments.
# Args: $1 = base URL for images (Pages URL or relative path)
#        $2 = results dir (to locate files)
build_diff_table() {
  local base_url="$1"
  local results_dir="$2"
  local table=""

  if [ ${#DIFF_NAMES[@]} -eq 0 ] && [ ${#NEW_NAMES[@]} -eq 0 ]; then
    echo ""
    return
  fi

  table="| Screen | Expected | Actual | Diff |
|--------|----------|--------|------|"

  for name in "${DIFF_NAMES[@]}"; do
    table="$table
| ${name} | ![expected](${base_url}/${name}-expected.png) | ![actual](${base_url}/${name}-actual.png) | ![diff](${base_url}/${name}-diff.png) |"
  done

  for name in "${NEW_NAMES[@]}"; do
    table="$table
| ${name} | _New — no baseline_ | ![actual](${base_url}/${name}-actual.png) | — |"
  done

  echo "$table"
}

# Build a summary line like "2/4 match, 1 diff, 1 new"
build_summary() {
  local parts=()
  if [ "$MATCH_COUNT" -gt 0 ]; then
    parts+=("$MATCH_COUNT/$TOTAL_COUNT match")
  fi
  if [ ${#DIFF_NAMES[@]} -gt 0 ]; then
    parts+=("${#DIFF_NAMES[@]} diff(s)")
  fi
  if [ ${#NEW_NAMES[@]} -gt 0 ]; then
    parts+=("${#NEW_NAMES[@]} new")
  fi
  if [ "$TOTAL_COUNT" -eq 0 ]; then
    echo "No visual tests ran"
    return
  fi
  local IFS=', '
  echo "${parts[*]}"
}
```

- [ ] **Step 2: Make it executable and verify syntax**

Run: `chmod +x scripts/visual-lib.sh && bash -n scripts/visual-lib.sh`
Expected: No output (clean syntax)

- [ ] **Step 3: Commit**

```bash
git add scripts/visual-lib.sh
git commit -m "feat: add shared image discovery library for visual diff scripts"
```

---

### Task 2: Update `post-e2e-comment.sh` to Embed Diff Images

**Files:**
- Modify: `scripts/post-e2e-comment.sh`
- Read: `scripts/visual-lib.sh` (from Task 1)

Replace the manual diff counting (lines 47-57) with the shared library and add inline image tables.

- [ ] **Step 1: Update `post-e2e-comment.sh`**

Replace the entire file with the updated version. Key changes:
- Source `visual-lib.sh` at the top
- Replace manual `find` + `wc` diff counting (lines 47-57) with `discover_images`
- Replace `VISUAL_STATUS` text with `build_summary` + `build_diff_table`
- Use `REPORT_URL` to construct image base URL as `${REPORT_URL}/visual-diffs`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/visual-lib.sh"

RESULTS_FILE="e2e/test-results/results.json"
RESULTS_DIR="e2e/test-results"
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

# Discover visual diffs
discover_images "$RESULTS_DIR"
VISUAL_SUMMARY=$(build_summary)

# Build image table if there are diffs or new screenshots
IMAGE_BASE_URL="${REPORT_URL:-}/visual-diffs"
DIFF_TABLE=$(build_diff_table "$IMAGE_BASE_URL" "$RESULTS_DIR")

if [ -n "$DIFF_TABLE" ]; then
  VISUAL_SECTION="### Visual Regression
${VISUAL_SUMMARY}

${DIFF_TABLE}"
else
  VISUAL_SECTION="### Visual Regression
✅ ${VISUAL_SUMMARY}"
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

${VISUAL_SECTION}

📎 [Full Report with Screenshots](${REPORT_URL:-https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID}) · [CI Run](https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)"

# Check if we already posted a comment on this PR (use REST API for numeric ID)
EXISTING=$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --jq ".[] | select(.body | contains(\"$MARKER\")) | .id" 2>/dev/null | head -1 || echo "")

if [ -n "$EXISTING" ]; then
  gh api "repos/$GITHUB_REPOSITORY/issues/comments/$EXISTING" -X PATCH -f body="$BODY"
else
  gh pr comment "$PR_NUMBER" --body "$BODY"
fi

echo "Posted E2E results to PR #$PR_NUMBER"
```

- [ ] **Step 2: Verify syntax**

Run: `bash -n scripts/post-e2e-comment.sh`
Expected: No output (clean syntax)

- [ ] **Step 3: Commit**

```bash
git add scripts/post-e2e-comment.sh
git commit -m "feat: embed visual diff images inline in PR comments"
```

---

### Task 3: Update CI Workflow to Deploy Diff Images

**Files:**
- Modify: `.github/workflows/e2e.yml`

Add a step between "Run E2E tests" and "Upload test artifacts" that copies diff images into the report directory so they're deployed to Pages.

- [ ] **Step 1: Add the copy step to `.github/workflows/e2e.yml`**

Insert this step after the "Run E2E tests" step (after line 132) and before "Upload test artifacts":

```yaml
      - name: Collect visual diff images
        if: always()
        run: |
          mkdir -p playwright-report/visual-diffs
          find e2e/test-results -name '*-actual.png' -o -name '*-expected.png' -o -name '*-diff.png' | while read f; do
            cp "$f" playwright-report/visual-diffs/
          done
          echo "Collected $(ls playwright-report/visual-diffs/*.png 2>/dev/null | wc -l | tr -d ' ') visual diff images"
```

- [ ] **Step 2: Verify YAML syntax**

Run: `npx yaml e2e < .github/workflows/e2e.yml > /dev/null 2>&1 || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e.yml'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: copy visual diff images to Pages deploy directory"
```

---

### Task 4: Local HTML Report Template

**Files:**
- Create: `scripts/visual-report-template.html`

A self-contained HTML template with placeholders that the bash script fills in. Uses `{{CONTENT}}` as the single placeholder for the image rows.

- [ ] **Step 1: Create `scripts/visual-report-template.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Diff Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0d1117; color: #e6edf3; padding: 2rem; }
    h1 { margin-bottom: 1.5rem; font-size: 1.5rem; }
    .summary { margin-bottom: 2rem; padding: 1rem; background: #161b22; border-radius: 8px; border: 1px solid #30363d; }
    .test-card { margin-bottom: 2rem; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
    .test-card h2 { padding: 0.75rem 1rem; background: #161b22; font-size: 1rem; border-bottom: 1px solid #30363d; }
    .test-card .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; }
    .badge-diff { background: #da3633; }
    .badge-new { background: #1f6feb; }
    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; padding: 1rem; }
    .images figure { margin: 0; }
    .images figcaption { font-size: 0.85rem; color: #8b949e; margin-bottom: 0.5rem; font-weight: 600; }
    .images img { max-width: 100%; border: 1px solid #30363d; border-radius: 4px; background: #fff; }
    .no-diffs { padding: 2rem; text-align: center; color: #3fb950; font-size: 1.1rem; }
  </style>
</head>
<body>
  <h1>Visual Diff Report</h1>
  {{CONTENT}}
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add scripts/visual-report-template.html
git commit -m "feat: add HTML template for local visual diff report"
```

---

### Task 5: `visual-comment.sh` Script

**Files:**
- Create: `scripts/visual-comment.sh`
- Read: `scripts/visual-lib.sh` (from Task 1)
- Read: `scripts/visual-report-template.html` (from Task 4)

- [ ] **Step 1: Create `scripts/visual-comment.sh`**

```bash
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
```

- [ ] **Step 2: Make it executable and verify syntax**

Run: `chmod +x scripts/visual-comment.sh && bash -n scripts/visual-comment.sh`
Expected: No output (clean syntax)

- [ ] **Step 3: Commit**

```bash
git add scripts/visual-comment.sh
git commit -m "feat: add visual-comment script for issue comments and local reports"
```

---

### Task 6: Wire Up package.json and .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add `visual:comment` script to `package.json`**

Add to the `"scripts"` section, after the `"test:e2e:smoke"` line:

```json
    "visual:comment": "bash scripts/visual-comment.sh"
```

- [ ] **Step 2: Add `e2e/visual-report/` to `.gitignore`**

Add at the end of the `# playwright` section:

```
e2e/visual-report/
```

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add visual:comment script and gitignore visual-report dir"
```

---

### Task 7: Manual Smoke Test

No code changes — verify the local report flow works end-to-end.

- [ ] **Step 1: Run visual tests to generate test-results**

Run: `npx playwright test --config=e2e/playwright.config.ts e2e/tests/visual/ --update-snapshots`

This generates baselines. If tests error due to missing auth/server, that's expected — we just need some `*-actual.png` files in `e2e/test-results/`.

- [ ] **Step 2: Generate the local report**

Run: `npm run visual:comment`

Expected: Opens `e2e/visual-report/index.html` in the browser with the side-by-side viewer. If no diffs exist (baselines just created), shows "All visual tests match their baselines."

- [ ] **Step 3: Test with filter**

Run: `npm run visual:comment -- --test=map-view`

Expected: Report only shows map-view results.

- [ ] **Step 4: Verify `e2e/visual-report/` is gitignored**

Run: `git status`

Expected: `e2e/visual-report/` does not appear in untracked files.
