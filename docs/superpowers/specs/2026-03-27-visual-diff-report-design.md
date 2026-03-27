# Visual Diff Report & Issue Comments

**Date:** 2026-03-27
**Status:** Approved

## Summary

Enhance the Playwright visual regression workflow to:
1. Embed actual diff images (expected/actual/diff) inline in PR comments instead of just a count
2. Provide a command to post visual diffs to GitHub issue comments (CI) or generate a local HTML report (local)

## Approach

Use GitHub Pages URLs (already deployed by the e2e CI workflow) to make diff images addressable. For local development, generate an HTML report to a gitignored directory.

## Design

### 1. Enhanced PR Comment with Inline Diff Images

**Current behavior:** `post-e2e-comment.sh` counts `*-diff.png` files and reports "X diffs detected" as text.

**New behavior:** When visual diffs or new screenshots are detected, embed a markdown table with images:

```markdown
### Visual Regression
2/4 match, 1 diff, 1 new

| Screen | Expected | Actual | Diff |
|--------|----------|--------|------|
| map-view | ![expected](...) | ![actual](...) | ![diff](...) |
| admin-settings | _New — no baseline_ | ![actual](...) | — |
```

Three cases for each visual test:
- **Match:** expected exists, no diff generated — counted in summary, no row in table
- **Mismatch:** expected + actual + diff all exist — show all three images
- **New (no baseline):** only actual exists — show actual with "New — no baseline" label

When all screenshots match, keep the existing "4/4 match" summary text with no image table.

### 2. CI Workflow Changes

Before the GitHub Pages deploy step, copy raw diff images from `e2e/test-results/` into `playwright-report/visual-diffs/` so they become URL-addressable at:
```
https://<owner>.github.io/<repo>/e2e-report/<run-id>/visual-diffs/<image>.png
```

### 3. Issue Comment Command

**Usage:**
```bash
# Local: generate visual diff report and open it
npm run visual:comment

# Local: filter to one test
npm run visual:comment -- --test=map-view

# CI: post to GitHub issue (requires REPORT_URL env var)
npm run visual:comment -- --issue=42
npm run visual:comment -- --issue=42 --test=map-view
```

**CI mode** (`REPORT_URL` is set): Posts a GitHub issue comment with images linked from Pages URLs. Uses the same markdown table format as the PR comment.

**Local mode** (no `REPORT_URL`): Generates an HTML report to `e2e/visual-report/` with a side-by-side comparison view and opens it in the browser.

### 4. Image Discovery Logic

Shared between both scripts:
1. Walk `e2e/test-results/`
2. Find `*-actual.png` files
3. For each, check if `*-expected.png` and `*-diff.png` exist alongside it
4. Classify as: "new" (actual only), "mismatch" (all three exist), or "match" (expected only, no diff)
5. When `--test=<name>` is provided, filter to files matching that name

### 5. Local HTML Report

Self-contained HTML file at `e2e/visual-report/index.html` with inline CSS. Shows side-by-side expected/actual/diff for each visual test. Images are copied into `e2e/visual-report/` alongside the HTML.

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `scripts/post-e2e-comment.sh` | Modify | Embed diff images in PR comment |
| `scripts/visual-comment.sh` | New | Issue comment (CI) + local report generation |
| `scripts/visual-report.html` | New | HTML template for local side-by-side viewer |
| `.github/workflows/e2e.yml` | Modify | Copy diff images to report dir before Pages deploy |
| `.gitignore` | Modify | Add `e2e/visual-report/` |
| `package.json` | Modify | Add `visual:comment` script |

## Constraints

- No new npm dependencies — bash scripts and self-contained HTML only
- Images served from GitHub Pages (CI) or local filesystem (dev)
- `--issue` flag only works in CI mode where `REPORT_URL` is available
