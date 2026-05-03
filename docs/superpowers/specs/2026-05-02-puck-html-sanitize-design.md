# Puck Rich-Text HTML Sanitization — Design

**Status:** Approved (parameter decisions locked 2026-05-02)
**Issue:** #304
**Predecessor:** PR #303 (Tier 1 CSS workaround for non-breaking-space overflow)
**Related:** #297 (TipTap unification — supersedes this design if/when it ships)

## Goal

Sanitize HTML written to `properties.puck_pages` and `properties.puck_pages_draft` so pasted content from external rich-text editors (Quill, Word, Google Docs, etc.) cannot:

1. Pollute saved data with foreign wrapper divs, classes, `xmlns` attributes, inline styles
2. Re-introduce horizontal-overflow problems (e.g., NBSP joiners, `style="white-space: nowrap"`, `style="width: 9999px"`)
3. Carry an XSS payload (e.g., `<a href="javascript:...">`, `<img onerror=...>`)

Tier 1 CSS guard (PR #303) prevents the visible breakage. This Tier 2 makes the data itself clean.

## Scope

**In scope**
- Server-side HTML sanitization at write time for the three Puck `richtext` field props (`content`, `text`, `quote` per `src/lib/puck/sanitize-data.ts:9`)
- One-time backfill script that re-saves all `puck_pages` and `puck_pages_draft` rows through the new sanitizer
- Tests covering: paste-from-Quill sample, XSS attempts, isolated NBSP preservation, allowlist enforcement

**Out of scope**
- Replacing Puck's built-in `richtext` field with TipTap (#297)
- Sanitizing TipTap-authored HTML in `knowledge_items.body_html` (TipTap's `PasteFormatDialog` handles paste at edit time)
- Migrating away from `dangerouslySetInnerHTML` in `RichText.tsx`
- Schema / column changes

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Library:** `isomorphic-dompurify` | Works server (Node) + edge + client; faster than `sanitize-html`; battle-tested XSS coverage |
| 2 | **Backfill:** save-time + one-time script | Save-time alone leaves existing dirty rows. Backfill is near-no-op for current data volume but the code path will exist for future rescue scenarios |
| 3 | **NBSP policy:** runs of 2+ → single regular space; isolated NBSP preserved | Preserves legitimate non-breaking-space use ("10 km", "Mr. Smith") |
| 4 | **Allowlist:** strict | No existing content to preserve; goal is forward-protection. Reject anything not on the list. |

### Allowlist

**Tags:** `p, a, strong, em, u, s, code, pre, blockquote, ul, ol, li, h2, h3, h4, br, hr, img`

**Attributes:**
- `a`: `href` (validate scheme: only `http:`, `https:`, `mailto:`, relative paths; reject `javascript:`, `data:`, `vbscript:`), `target`, `rel`. Auto-add `rel="noopener noreferrer"` when `target="_blank"`.
- `img`: `src` (same scheme validation as `href`), `alt`, `width`, `height`
- All other tags: no attributes. `class`, `style`, `id`, `xmlns`, `data-*`, event handlers — all stripped.

DOMPurify's default behavior on disallowed tags is to strip the tag but keep its inner text — exactly what we want for foreign wrapper divs.

### NBSP Normalization

Run **after** DOMPurify on its output string. DOMPurify decodes entities, so by the time we run our regex the content contains the literal U+00A0 character (NBSP), not the `&nbsp;` text reference.

```ts
// Match runs of 2+ NBSP, regular space, or any combination thereof.
// The character class contains: U+0020 (space), U+00A0 (NBSP).
function normalizeNbsp(html: string): string {
  return html.replace(/[  ]{2,}/g, ' ');
}
```

Single isolated NBSP is left alone (preserves "10 km", "Mr. Smith"). Runs of 2+ collapse to one ASCII space — losing the non-break property is intentional, since 2+ consecutive NBSPs are almost always a paste artifact.

## Architecture

### Components

```
src/lib/puck/
├── sanitize-html.ts             [NEW] DOMPurify config + nbsp normalizer
├── sanitize-data.ts             [MODIFY] integrate sanitize-html into walkComponents
├── __tests__/
│   ├── sanitize-html.test.ts    [NEW]
│   └── sanitize-data.test.ts    [MODIFY: add cases covering richtext sanitization]

src/app/admin/site-builder/
└── actions.ts                   [MODIFY] savePuckPageDraft + publishPuckPages call sanitizer before write

scripts/
└── backfill-puck-sanitize.mjs   [NEW] one-time script: read all properties, sanitize, write back
```

### Data flow

```
User saves page in Puck editor
        |
        v
PuckPageEditor.tsx                            (client)
        |
        v
savePuckPageDraft(path, data)                 (server action)
        |
        v
sanitizePuckData(data)                        (existing — handles empty richtext)
        |
        v
sanitizeRichTextProps(data)                   (NEW — runs HTML through DOMPurify + nbsp-normalize)
        |
        v
Supabase UPDATE properties SET puck_pages_draft = ...
```

`publishPuckPages` reads `puck_pages_draft` and copies to `puck_pages`. Since draft is already sanitized, publish doesn't need to re-sanitize. Defense-in-depth: re-sanitize on publish anyway — idempotent, no perf cost worth measuring.

### Why save-time, not render-time

- Render-time is hot path; sanitization on every page view is wasted work
- Saved data should be clean at rest — render-time sanitization papers over a data-quality problem
- Save-time also catches the issue once and propagates the clean version everywhere

## Backfill Script

`scripts/backfill-puck-sanitize.mjs`

**Behavior:**
1. Load Supabase env via `vercel env pull` or `.env.local` (whichever the operator uses)
2. `SELECT id, puck_pages, puck_pages_draft FROM properties WHERE puck_pages IS NOT NULL OR puck_pages_draft IS NOT NULL`
3. For each row, run both columns through `sanitizePuckData` + `sanitizeRichTextProps`
4. Compare before/after JSON. If unchanged, skip. If changed, log diff summary and queue update.
5. Run with `--dry-run` flag default; `--apply` actually writes.
6. Print summary: rows scanned / rows changed / rows updated / errors.

**Safety:**
- `--dry-run` first; operator reviews diff summary before `--apply`
- Idempotent: re-running `--apply` on an already-clean DB is a no-op
- No DDL — only data updates; rolled back via Supabase point-in-time restore if needed
- Run from operator's machine, not CI — service-role key never enters CI

## Error Handling

- Sanitization failure (malformed input that throws): log and fall back to empty string for **that field only**. Do not swallow other field values.
- Network/Supabase errors during backfill: continue, log row IDs that failed, exit non-zero.
- DOMPurify init failure server-side (jsdom unavailable): log clearly, fail fast — should not happen in normal Node runtimes since `isomorphic-dompurify` bundles its own jsdom.

## Testing

**Unit (Vitest)**

`sanitize-html.test.ts`:
- Allowlisted tags pass through
- Disallowed tags (`script`, `iframe`, `style`, `link`, `meta`, `form`, `input`, `div`, `span`, `table`, `h1`, `h5`, `h6`) stripped (text content kept)
- `class`, `style`, `id`, `xmlns`, `data-*`, event handlers stripped
- `<a href="javascript:...">` — href removed
- `<img onerror=...>` — onerror removed
- `<a target="_blank">` auto-adds `rel="noopener noreferrer"`
- Quill paste sample (the actual saved HTML from PR #303 conversation): wrapper divs gone, `xmlns` gone, NBSP runs collapsed
- Single NBSP preserved
- Empty input returns empty string
- Throws-input falls back to empty string (no uncaught throw)

`sanitize-data.test.ts` (extend existing):
- `walkComponents` invokes HTML sanitizer on `content`, `text`, `quote` props
- Non-richtext props untouched
- Nested slot components also processed (recursive walk)

**Integration**

`actions.test.ts` (create if not present): `savePuckPageDraft` with malicious payload → DB row contains sanitized output (mock Supabase client, assert UPDATE payload).

**Manual / E2E**
- Paste a sample with `<script>alert(1)</script>` into a Puck `RichText` block, save, reload — no alert, no `<script>` in DOM.

## Risks

| Risk | Mitigation |
|---|---|
| DOMPurify config drift if multiple call sites diverge | Single shared config module (`sanitize-html.ts`); both runtimes import same allowlist |
| Backfill bug overwrites good data | `--dry-run` default; manual operator review of diff before `--apply` |
| Allowlist too strict, breaks future legitimate content (e.g., team adds tables to a page) | Allowlist lives in one file; PR to extend is small. Document the location prominently in the file header. |
| Performance: HTML parse on every save | Save is rare (user action). Acceptable. |

## Acceptance Criteria

- [ ] `isomorphic-dompurify` installed; server-action runtime works
- [ ] `src/lib/puck/sanitize-html.ts` exports `sanitizeRichTextHtml(input: string): string`
- [ ] `src/lib/puck/sanitize-data.ts` calls `sanitizeRichTextHtml` on `content`/`text`/`quote` props
- [ ] `savePuckPageDraft` and `publishPuckPages` route through the sanitizer
- [ ] Backfill script committed to `scripts/`, documented in playbook
- [ ] Operator runs backfill with `--dry-run` then `--apply`; logs attached to PR
- [ ] All unit tests pass (`npm run test`)
- [ ] `npm run type-check` passes
- [ ] Manual XSS smoke test passes on preview deploy
