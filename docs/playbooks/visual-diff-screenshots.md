# Playbook: Visual Diff Screenshots for Issue Completion

**Purpose:** Capture before/after screenshots when completing issues that affect the UI. Include the screenshots in the PR description so reviewers can see the visual impact without running the code.

**When to use:** Any issue that changes visible UI — layout fixes, component changes, styling updates, new pages, navigation changes. Skip for backend-only changes (server actions, migrations, API routes).

---

## Workflow

### Step 1: Identify Affected Pages

Before writing any code, determine which pages/views the change will affect. Use the issue description and file analysis to build a list.

Examples:
- Issue says "fix expand map button" → affected page: `/map`
- Issue says "hide Manage nav for unauthenticated users" → affected pages: `/`, `/map`, `/about` (any page with nav)
- Issue says "add member drill-down page" → affected page: `/admin/members/[userId]` (new page, no "before")

### Step 2: Capture "Before" Screenshots

Before making code changes, capture the current state of affected pages.

**Using Claude Code with Chrome browser tools:**

```
1. Get browser context:
   mcp__claude-in-chrome__tabs_context_mcp

2. Create a new tab:
   mcp__claude-in-chrome__tabs_create_mcp({ url: "<page-url>" })

3. Wait for page to load, then capture:
   mcp__claude-in-chrome__gif_creator or mcp__claude-in-chrome__computer (screenshot)

4. Save screenshots with descriptive names:
   before-map-page.png
   before-nav-desktop.png
   before-nav-mobile.png
```

**Using the Vercel preview URL or production URL:**
- Production (current state): `https://fairbankseagle.org/<path>`
- Or local dev: `http://localhost:3000/<path>`

**Tips:**
- Capture both desktop and mobile viewports if the change is responsive
- For auth-gated pages, sign in first
- For state-dependent UI (loading, empty, error), capture the relevant state
- Name files clearly: `before-<page>-<viewport>.png`

### Step 3: Implement the Fix

Make the code changes as normal. Commit your work.

### Step 4: Capture "After" Screenshots

After the fix is deployed to the Vercel preview (or running locally), capture the same pages/viewports:

```
after-map-page.png
after-nav-desktop.png
after-nav-mobile.png
```

**Important:** Capture the exact same pages, viewports, and states as the "before" screenshots for a clean comparison.

### Step 5: Include in PR Description

Add a visual diff section to the PR body:

```markdown
## Visual Changes

### Map Page — Expand Button
| Before | After |
|--------|-------|
| ![before](before-map-page.png) | ![after](after-map-page.png) |

### Navigation — Desktop (Unauthenticated)
| Before | After |
|--------|-------|
| ![before](before-nav-desktop.png) | ![after](after-nav-desktop.png) |
```

**For new pages (no "before"):**
```markdown
## Visual Changes

### New: Member Drill-Down Page
![member-detail](after-member-detail.png)
```

**For removed UI:**
```markdown
## Visual Changes

### Removed: Location Permission Prompt
| Before | After |
|--------|-------|
| ![before](before-location-prompt.png) | No prompt shown |
```

### Uploading Screenshots

**Option A: Drag-and-drop into GitHub PR description** (simplest)
- GitHub auto-hosts the images

**Option B: Commit to branch**
- Save to `.github/screenshots/` in the PR branch
- Reference with relative paths
- Delete after merge (or .gitignore the directory)

**Option C: Use GitHub issue comment API**
```bash
# Upload an image to a GitHub issue/PR comment
gh pr comment <pr-number> --body "![before](url) ![after](url)"
```

---

## File-to-Page Mapping Reference

Common files and the pages they visually affect:

| File Pattern | Affected Pages |
|---|---|
| `src/components/layout/Navigation.tsx` | All pages (/, /map, /about, /list, /manage, /admin) |
| `src/components/map/MapView.tsx` | /map |
| `src/components/map/LocateButton.tsx` | /map |
| `src/components/map/GoToFieldButton.tsx` | /map |
| `src/components/landing/*` | / (with landing page enabled) |
| `src/components/platform/*` | / (platform domain), /signup, /signin |
| `src/app/admin/page.tsx` | /admin |
| `src/app/admin/properties/page.tsx` | /admin/properties |
| `src/app/admin/members/*` | /admin/members, /admin/members/[userId] |
| `src/app/admin/roles/*` | /admin/roles, /admin/roles/[roleId] |
| `src/app/admin/domains/*` | /admin/domains |
| `src/app/admin/settings/*` | /admin/settings |
| `src/app/admin/properties/[slug]/*` | /admin/properties/[slug]/* |
| `src/app/login/page.tsx` | /login |
| `src/app/signup/page.tsx` | /signup |
| `src/app/signin/page.tsx` | /signin |
| `src/styles/globals.css` | All pages |
| `tailwind.config.ts` | All pages |

---

## Example: Complete Workflow

Issue: "Fix expand map button icon rendering on mobile"

```
1. BEFORE — Identify affected pages:
   - /map (mobile viewport)

2. BEFORE — Capture screenshots:
   - Navigate to fairbankseagle.org/map on mobile viewport
   - Screenshot: before-map-mobile.png

3. IMPLEMENT — Fix the code:
   - Update MapView.tsx (z-index, padding, SVG path)
   - Commit and push

4. AFTER — Capture screenshots:
   - Wait for Vercel preview deploy
   - Navigate to preview-url/map on mobile viewport
   - Screenshot: after-map-mobile.png

5. PR — Include in description:
   ## Visual Changes
   ### Map — Expand Button (Mobile)
   | Before | After |
   |--------|-------|
   | ![before](before-map-mobile.png) | ![after](after-map-mobile.png) |
```

---

## When to Skip

- Backend-only changes (server actions, migrations, API routes, database queries)
- Test-only changes
- Documentation updates
- Config/env changes
- Dependency updates (unless they visually affect the UI)
