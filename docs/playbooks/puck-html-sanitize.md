# Puck HTML Sanitization Playbook

## What this is

Server-side HTML sanitization (DOMPurify allowlist + NBSP normalization) on
every save to `properties.puck_pages` and `properties.puck_pages_draft`.
Implemented in:

- `src/lib/puck/sanitize-html.ts` — allowlist + sanitizer
- `src/lib/puck/sanitize-data.ts` — `sanitizePuckDataForWrite` walks the Puck
  tree and applies the sanitizer to richtext props
- `src/app/admin/site-builder/actions.ts` — calls the sanitizer in
  `savePuckPageDraft`, `savePuckRootDraft`, `publishPuckPages`,
  `publishPuckRoot`

Spec: `docs/superpowers/specs/2026-05-02-puck-html-sanitize-design.md`
Issue: #304

## Operator tasks

### Run the one-time backfill

The backfill re-saves all existing `puck_pages` / `puck_pages_draft` /
`puck_root` / `puck_root_draft` rows through the sanitizer. Idempotent —
already-clean rows skip the UPDATE.

```bash
# 1. Pull production env vars
vercel env pull .env.local

# 2. Export them
set -a; . .env.local; set +a

# 3. Dry run — review the diff
npm run backfill:puck-sanitize

# 4. Apply — actually write
npm run backfill:puck-sanitize -- --apply
```

Save the output of step 3 and step 4 to the PR for record.

### Extending the allowlist

If a future requirement needs (for example) `<table>` support in Puck pages:

1. Edit `src/lib/puck/sanitize-html.ts` `ALLOWED_TAGS` constant — add
   `'table', 'thead', 'tbody', 'tr', 'th', 'td'`.
2. If the new tag uses attributes, add them to `ALLOWED_ATTR`.
3. Add a unit test in `src/lib/puck/__tests__/sanitize-html.test.ts`
   confirming the new tag round-trips.
4. Note: data already saved BEFORE the allowlist extension had the tag
   stripped at write time and that data is gone. To recover, restore from a
   Supabase point-in-time backup. Re-running the backfill after extending
   the allowlist does not bring stripped data back.

### Disabling sanitization (emergency)

If sanitization is over-aggressively breaking content:

1. Revert the actions changes — comment out the `sanitizePuckDataForWrite`
   call in `savePuckPageDraft` / `savePuckRootDraft` and use
   `parseResult.data` directly.
2. Deploy.
3. Existing already-sanitized data stays as-is — no automatic restore.

### Rotating the sanitization library

`isomorphic-dompurify` is the only dependency owned by this feature. To
upgrade:

```bash
npm install isomorphic-dompurify@latest
npm run test -- --run src/lib/puck
```

If tests pass, ship. If not, the new version may have changed default URI
regex or hook semantics — read the upstream changelog.

## Cost / performance notes

- Save path: ~5–20 ms additional per `savePuckPageDraft` call (DOMPurify
  parse + serialize). Save is a user action — acceptable.
- Render path: unchanged. No sanitization at render.
- Backfill: O(rows × richtext-blocks). For current data volume (~tens of
  rows), under one minute total.
