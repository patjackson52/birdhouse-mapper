# 0010 — Richtext Sanitization Boundary

**Status:** Accepted
**Date:** 2026-05-03
**Issue:** [#304](https://github.com/patjackson52/birdhouse-mapper/issues/304)
**PR:** [#307](https://github.com/patjackson52/birdhouse-mapper/pull/307)
**Spec:** [docs/superpowers/specs/2026-05-02-puck-html-sanitize-design.md](../superpowers/specs/2026-05-02-puck-html-sanitize-design.md)

## Context

The Puck editor stores richtext field content as raw HTML strings inside JSON blobs in `properties.puck_pages`, `properties.puck_pages_draft`, `properties.puck_root`, and `properties.puck_root_draft`. These columns are later rendered via `dangerouslySetInnerHTML` in `RichText.tsx`.

Users can paste content from external rich-text editors (Quill, Google Docs, Microsoft Word). Such pastes arrive with foreign wrapper `<div>` tags, `xmlns` attributes, inline `style` attributes, and `class` names. More critically, a malicious or compromised user could submit HTML with XSS payloads such as `<a href="javascript:...">`, `<img onerror="...">`, or `<script>` blocks. Because the editor sends its data to server actions that write directly to Supabase, any unsanitized HTML becomes persistent and is served to every viewer of that property's public pages.

PR #303 added a Tier 1 CSS workaround that prevents visible layout breakage from NBSP-induced overflow. PR #307 (this ADR) adds the Tier 2 data-layer fix: sanitize at write time so the stored data is clean.

## Decision

### Boundary statement

**All richtext HTML is untrusted until it passes through `sanitizePuckDataForWrite` in a server action. Any value read from `properties.puck_pages`, `properties.puck_pages_draft`, `properties.puck_root`, or `properties.puck_root_draft` after a write that went through a current server action is trusted — the stored data contains only the allow-listed tags and attributes defined in `src/lib/puck/sanitize-html.ts`.**

### Where sanitization happens

Sanitization occurs on the server, inside `'use server'` actions, before any Supabase write:

| Entry point | File | Column(s) written |
|---|---|---|
| `savePuckPageDraft` | `src/app/admin/site-builder/actions.ts` | `puck_pages_draft` |
| `savePuckRootDraft` | `src/app/admin/site-builder/actions.ts` | `puck_root_draft` |
| `publishPuckPages` | `src/app/admin/site-builder/actions.ts` | `puck_pages` (defense-in-depth re-sanitize) |
| `publishPuckRoot` | `src/app/admin/site-builder/actions.ts` | `puck_root` (defense-in-depth re-sanitize) |
| `applyTemplate` | `src/app/admin/site-builder/actions.ts` | `puck_root`, `puck_root_draft`, `puck_pages`, `puck_pages_draft` |

The render path (`RichText.tsx`, any server component reading `puck_pages`) does **not** sanitize. It relies on the stored data being clean.

### How sanitization works

Two functions compose the sanitization pipeline:

**`sanitizePuckDataForWrite(data: Data): Data`** (`src/lib/puck/sanitize-data.ts`)
- Deep-clones the Puck data tree.
- Walks every component in `data.content`, `data.zones`, and `data.root.content`, recursing into slot arrays.
- For each richtext prop (`content`, `text`, `quote`): empty strings become `null`; non-empty strings are passed to `sanitizeRichTextHtml`.
- Non-richtext props are untouched.

**`sanitizeRichTextHtml(input: string): string`** (`src/lib/puck/sanitize-html.ts`)
- Runs the string through `isomorphic-dompurify` with a strict allow-list configuration.
- Post-processes the DOMPurify output to normalize NBSP runs.
- Fail-closed: any exception returns `''` (never propagates malformed content).

### Allow-list

**Tags (19):** `p`, `a`, `strong`, `em`, `u`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `h2`, `h3`, `h4`, `br`, `hr`, `img`

Everything not on this list has its tag stripped but text content preserved (DOMPurify default). This means foreign wrapper `<div>`, `<span>`, `<table>`, `<h1>`, `<h5>`, `<h6>`, `<script>`, `<iframe>`, `<style>`, `<form>`, `<input>` etc. are all stripped.

**Attributes (7):** `href`, `target`, `rel`, `src`, `alt`, `width`, `height`

All other attributes are stripped, including `class`, `style`, `id`, `xmlns`, and all `data-*` attributes (`ALLOW_DATA_ATTR: false`). Event handler attributes (`onclick`, `onerror`, etc.) are stripped by DOMPurify's default XSS rules.

**URI scheme enforcement:** DOMPurify's default `ALLOWED_URI_REGEXP` rejects `javascript:`, `data:`, and `vbscript:` in `href` and `src`. No override is applied — we rely on the DOMPurify default.

**`target="_blank"` auto-hardening:** A global `afterSanitizeAttributes` hook on the `isomorphic-dompurify` singleton automatically adds `rel="noopener noreferrer"` to any `<a>` with `target="_blank"`. Note: this hook mutates the singleton — if any other code in the process imports and calls `isomorphic-dompurify` directly it will also run this hook.

### NBSP normalization

After DOMPurify serializes output, `jsdom` re-encodes U+00A0 as `&nbsp;`. The pipeline decodes these back to literal U+00A0, then collapses runs of two or more consecutive U+0020 / U+00A0 characters (in any mix) to a single ASCII space. An isolated U+00A0 is preserved (legitimate "10 km", "Mr. Smith" usage). This runs after DOMPurify, on its output string.

### Fail-closed behavior

- Sanitization exception on any individual richtext prop → that prop becomes `''` (coerced to `null` by the walker). Other props in the same component and all other components proceed normally.
- The server action does not swallow the exception globally; only the affected field is zeroed.
- Data that fails Zod schema validation (`puckDataSchema.safeParse`) is rejected before sanitization is attempted.

### Backfill

Rows written before PR #307 may contain unsanitized HTML. A one-time backfill script at `scripts/backfill-puck-sanitize.ts` runs every existing `puck_pages` and `puck_pages_draft` row through `sanitizePuckDataForWrite`. Defaults to `--dry-run`; `--apply` to persist. Idempotent. Operator playbook: `docs/playbooks/puck-html-sanitize.md`.

## Consequences

**Positive:**
- XSS payloads (script injection, javascript: URIs, event-handler attributes) cannot survive a save through any current server action.
- Foreign paste artifacts (xmlns, class, style, wrapper divs) are stripped at write time, keeping stored data minimal.
- Render path is simple — `dangerouslySetInnerHTML` is safe against stored XSS for content written after this ADR.
- Allow-list is centralized in one file (`sanitize-html.ts`); extending it is a one-line PR.

**Negative:**
- Defense-in-depth re-sanitize on publish adds a small constant cost (acceptable; save is a rare user action).
- The `afterSanitizeAttributes` DOMPurify hook is a global singleton mutation; any future direct use of `isomorphic-dompurify` elsewhere in the process will also run the `target="_blank"` hook.
- `isomorphic-dompurify` pulls in `jsdom` as a server-side DOM, which required externalizing the package in `next.config.js` (`experimental.serverComponentsExternalPackages`) to prevent webpack from bundling jsdom's `fs.readFileSync` asset load.
- Rows written before the backfill is run may still contain unsanitized HTML. The render path has no fallback sanitizer — operators must run the backfill.

**Neutral:**
- `sanitizePuckData` (load-side, empty-string → null) semantics are unchanged; `sanitizePuckDataForWrite` is a superset that adds HTML sanitization on top.
- The allow-list intentionally excludes `<table>`, `<h1>`, `<h5>`, `<h6>`, `<div>`, `<span>`. Adding them requires a deliberate PR to `sanitize-html.ts`.

## Alternatives considered

- **Client-side sanitization only.** Rejected — client-side sanitization can be bypassed by a modified client or direct API call. The server action is the only trustworthy enforcement point.
- **Render-time sanitization (sanitize on every page view).** Rejected — it papers over a data-quality problem, adds overhead on the hot render path, and means stored data remains dirty indefinitely.
- **`DOMPurify` in the browser bundle (no `isomorphic-dompurify`).** Rejected — server actions run in Node, not the browser; `DOMPurify` requires a DOM environment. `isomorphic-dompurify` provides the jsdom shim transparently for both runtimes.
- **`sanitize-html` npm package instead of DOMPurify.** Rejected — `isomorphic-dompurify` is faster, has broader XSS coverage, and is more widely battle-tested per the spec evaluation.
- **Allow-list extension (permissive).** Rejected — there is no existing content that requires tables, span, or div; a strict forward-only allow-list is cheaper to maintain and reduces attack surface.

## Related Files

- `src/lib/puck/sanitize-html.ts` — DOMPurify config + allow-list + NBSP normalizer
- `src/lib/puck/sanitize-data.ts` — tree walker; `sanitizePuckDataForWrite` + `sanitizePuckData`
- `src/app/admin/site-builder/actions.ts` — all write entry points
- `scripts/backfill-puck-sanitize.ts` — one-time backfill script
- `src/lib/puck/__tests__/sanitize-html.test.ts` — unit tests for the sanitizer
- `src/lib/puck/__tests__/sanitize-data.test.ts` — unit tests for the tree walker
- `docs/playbooks/puck-html-sanitize.md` — operator playbook (backfill, allowlist extension, emergency disable)

## Tags

`security`, `puck`, `xss`, `sanitization`, `richtext`
