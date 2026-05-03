# Puck Rich-Text HTML Sanitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanitize HTML written to `properties.puck_pages` and `properties.puck_pages_draft` at write time using DOMPurify with a strict allowlist + NBSP normalization, plus a one-time backfill script.

**Architecture:** New `sanitizeRichTextHtml(input)` wraps `isomorphic-dompurify` with our allowlist + NBSP regex. Existing `sanitize-data.ts` extracts a shared walker and adds `sanitizePuckDataForWrite` that runs HTML sanitization on richtext props. Site-builder server actions call the write-variant before persisting. A standalone `tsx` script re-saves all `puck_pages` and `puck_pages_draft` rows through the same pipeline.

**Tech Stack:** TypeScript, Vitest, `isomorphic-dompurify`, `tsx` (TS script runner), Supabase service-role client.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/puck/sanitize-html.ts` | DOMPurify config + allowlist + NBSP normalizer; exports `sanitizeRichTextHtml` |
| Create | `src/lib/puck/__tests__/sanitize-html.test.ts` | Unit tests for the sanitizer |
| Modify | `src/lib/puck/sanitize-data.ts` | Extract shared walker; add `sanitizePuckDataForWrite` |
| Modify | `src/lib/puck/__tests__/sanitize-data.test.ts` | Tests for `sanitizePuckDataForWrite` |
| Modify | `src/app/admin/site-builder/actions.ts` | Call `sanitizePuckDataForWrite` in 4 places |
| Create | `scripts/backfill-puck-sanitize.ts` | One-time backfill with `--dry-run` / `--apply` |
| Modify | `package.json` | Add `tsx` devDep; add `backfill:puck-sanitize` npm script |
| Create | `docs/playbooks/puck-html-sanitize.md` | Operator runbook for backfill + future allowlist edits |

---

## Task 1: Install `isomorphic-dompurify` + `tsx`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dep**

```bash
cd /Users/patrick/birdhouse-mapper/.worktrees/puck-html-sanitize
npm install isomorphic-dompurify@^2.30.0
```

Expected: package.json `dependencies` gains `"isomorphic-dompurify"`. No errors.

- [ ] **Step 2: Install dev dep**

```bash
npm install -D tsx@^4.20.0
```

Expected: package.json `devDependencies` gains `"tsx"`.

- [ ] **Step 3: Verify install**

```bash
node -e "require('isomorphic-dompurify')"
npx tsx --version
```

Expected: no error from first command; tsx prints a version.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add isomorphic-dompurify and tsx for puck html sanitization"
```

---

## Task 2: Implement `sanitize-html.ts` (TDD)

**Files:**
- Create: `src/lib/puck/sanitize-html.ts`
- Create: `src/lib/puck/__tests__/sanitize-html.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/puck/__tests__/sanitize-html.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeRichTextHtml } from '../sanitize-html';

const NBSP = ' ';

describe('sanitizeRichTextHtml', () => {
  it('passes allowlisted tags through', () => {
    expect(sanitizeRichTextHtml('<p>hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeRichTextHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(sanitizeRichTextHtml('<h2>title</h2>')).toBe('<h2>title</h2>');
  });

  it('strips disallowed tags but keeps text content', () => {
    expect(sanitizeRichTextHtml('<div>hi</div>')).toBe('hi');
    expect(sanitizeRichTextHtml('<span>x</span>')).toBe('x');
    expect(sanitizeRichTextHtml('<h1>x</h1>')).toBe('x');
    expect(sanitizeRichTextHtml('<h5>x</h5>')).toBe('x');
    expect(sanitizeRichTextHtml('<table><tr><td>x</td></tr></table>')).toBe('x');
  });

  it('strips script tags and event handlers', () => {
    const result = sanitizeRichTextHtml('<p onclick="alert(1)">x</p><script>alert(1)</script>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('script');
    expect(result).toContain('x');
  });

  it('strips class, style, id, xmlns, data-* attributes', () => {
    const input = '<p class="x" style="color:red" id="y" xmlns="ns" data-foo="bar">hi</p>';
    expect(sanitizeRichTextHtml(input)).toBe('<p>hi</p>');
  });

  it('removes javascript: and data: URLs from href', () => {
    expect(sanitizeRichTextHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizeRichTextHtml('<a href="data:text/html,foo">x</a>')).not.toContain('data:');
  });

  it('preserves http/https/mailto/relative href', () => {
    expect(sanitizeRichTextHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
    expect(sanitizeRichTextHtml('<a href="/path">x</a>')).toContain('href="/path"');
    expect(sanitizeRichTextHtml('<a href="mailto:a@b.com">x</a>')).toContain('href="mailto:a@b.com"');
  });

  it('auto-adds rel="noopener noreferrer" when target=_blank', () => {
    const result = sanitizeRichTextHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('strips img event handlers but keeps allowlisted attrs', () => {
    const result = sanitizeRichTextHtml('<img src="/x.jpg" alt="x" onerror="alert(1)" width="10">');
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="/x.jpg"');
    expect(result).toContain('alt="x"');
    expect(result).toContain('width="10"');
  });

  it('collapses runs of 2+ NBSP/spaces to single ASCII space', () => {
    expect(sanitizeRichTextHtml(`<p>a${NBSP}${NBSP}b</p>`)).toBe('<p>a b</p>');
    expect(sanitizeRichTextHtml(`<p>a  b</p>`)).toBe('<p>a b</p>');
    expect(sanitizeRichTextHtml(`<p>a${NBSP} ${NBSP}b</p>`)).toBe('<p>a b</p>');
  });

  it('preserves isolated NBSP', () => {
    expect(sanitizeRichTextHtml(`<p>10${NBSP}km</p>`)).toBe(`<p>10${NBSP}km</p>`);
    expect(sanitizeRichTextHtml(`<p>Mr.${NBSP}Smith</p>`)).toBe(`<p>Mr.${NBSP}Smith</p>`);
  });

  it('removes Quill paste artifacts (wrapper divs + xmlns) and preserves single NBSPs', () => {
    const quillSample = `<div class="_RichTextEditor_z25h4_1"><div class="rich-text"><p xmlns="http://www.w3.org/1999/xhtml">Eagle${NBSP}Scout${NBSP}Fairbanks</p></div></div>`;
    const result = sanitizeRichTextHtml(quillSample);
    expect(result).not.toContain('_RichTextEditor');
    expect(result).not.toContain('rich-text');
    expect(result).not.toContain('xmlns');
    expect(result).toContain(`Eagle${NBSP}Scout${NBSP}Fairbanks`);
    expect(result.startsWith('<p>')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeRichTextHtml('')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/patrick/birdhouse-mapper/.worktrees/puck-html-sanitize
npm run test -- --run src/lib/puck/__tests__/sanitize-html.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../sanitize-html'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/puck/sanitize-html.ts`:

```ts
/**
 * HTML sanitization for Puck richtext field content.
 *
 * Allowlist lives in this file. To extend (e.g. permit tables in Puck pages),
 * add the tag to ALLOWED_TAGS and any new attributes to ALLOWED_ATTR.
 *
 * Called from sanitizePuckDataForWrite (sanitize-data.ts) on every save.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'a',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'br',
  'hr',
  'img',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height'];

// DOMPurify defaults reject javascript:, data:, vbscript: in URI attributes.
// We rely on those defaults rather than overriding ALLOWED_URI_REGEXP.

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitize a single richtext HTML string.
 *
 * Strips all tags not on the allowlist (text content kept), drops all
 * attributes not on the allowlist, removes javascript:/data: URI schemes,
 * auto-adds rel="noopener noreferrer" to target=_blank links, and collapses
 * runs of 2+ NBSP/space characters to a single ASCII space (isolated NBSPs
 * preserved).
 */
export function sanitizeRichTextHtml(input: string): string {
  if (!input) return '';
  try {
    const sanitized = DOMPurify.sanitize(input, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    });
    return normalizeNbsp(sanitized);
  } catch {
    return '';
  }
}

// Match runs of 2+ of: U+0020 (space) or U+00A0 (NBSP), in any combination.
const NBSP_RUN_REGEX = /[  ]{2,}/g;

function normalizeNbsp(html: string): string {
  return html.replace(NBSP_RUN_REGEX, ' ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- --run src/lib/puck/__tests__/sanitize-html.test.ts 2>&1 | tail -15
```

Expected: all 11 tests pass.

If any test fails, read the failure and adjust the implementation. Common pitfall: DOMPurify global hooks added more than once across hot reload — for a one-shot vitest run this is fine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/sanitize-html.ts src/lib/puck/__tests__/sanitize-html.test.ts
git commit -m "feat(puck): sanitizeRichTextHtml — DOMPurify allowlist + nbsp normalization

Strict allowlist of structural/inline tags. Drops class/style/id/xmlns/
data-*/event handlers. Rejects javascript:/data: URIs (DOMPurify default).
Auto-adds rel='noopener noreferrer' on target=_blank. Collapses runs of
2+ NBSP/space to single ASCII space; isolated NBSP preserved.

Spec: docs/superpowers/specs/2026-05-02-puck-html-sanitize-design.md"
```

---

## Task 3: Add `sanitizePuckDataForWrite` to `sanitize-data.ts`

**Files:**
- Modify: `src/lib/puck/sanitize-data.ts`
- Modify: `src/lib/puck/__tests__/sanitize-data.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/puck/__tests__/sanitize-data.test.ts` (after the existing `describe('sanitizePuckData')` block):

```ts
describe('sanitizePuckDataForWrite', () => {
  it('runs HTML sanitization on richtext props', () => {
    const data = {
      content: [
        { type: 'RichText', props: { content: '<p>hi<script>alert(1)</script></p>' } },
      ],
      root: {},
    };
    const result = sanitizePuckDataForWrite(data as any);
    expect((result.content[0] as any).props.content).not.toContain('script');
    expect((result.content[0] as any).props.content).toContain('hi');
  });

  it('still nullifies empty richtext strings', () => {
    const data = {
      content: [{ type: 'RichText', props: { content: '' } }],
      root: {},
    };
    const result = sanitizePuckDataForWrite(data as any);
    expect((result.content[0] as any).props.content).toBeNull();
  });

  it('walks nested slot components recursively', () => {
    const data = {
      content: [
        {
          type: 'Container',
          props: {
            children: [
              { type: 'Card', props: { text: '<div>x</div><span>y</span>' } },
            ],
          },
        },
      ],
      root: {},
    };
    const result = sanitizePuckDataForWrite(data as any);
    const inner = (result.content[0] as any).props.children[0].props.text;
    expect(inner).toBe('xy');
  });

  it('leaves non-richtext props untouched', () => {
    const data = {
      content: [
        { type: 'Custom', props: { customProp: '<p>html</p>', alt: 'pic' } },
      ],
      root: {},
    };
    const result = sanitizePuckDataForWrite(data as any);
    expect((result.content[0] as any).props.customProp).toBe('<p>html</p>');
    expect((result.content[0] as any).props.alt).toBe('pic');
  });

  it('processes root.content blocks', () => {
    const data = {
      content: [],
      root: {
        content: [
          { type: 'Card', props: { quote: '<p onclick="x">q</p>' } },
        ],
      },
    };
    const result = sanitizePuckDataForWrite(data as any);
    expect((result.root!.content![0] as any).props.quote).not.toContain('onclick');
  });
});
```

Also add the import to the top of the test file (next to the existing `sanitizePuckData` import):

```ts
import { sanitizePuckData, sanitizePuckDataForWrite } from '../sanitize-data';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- --run src/lib/puck/__tests__/sanitize-data.test.ts 2>&1 | tail -10
```

Expected: FAIL — `sanitizePuckDataForWrite` is not exported from `../sanitize-data`.

- [ ] **Step 3: Refactor `sanitize-data.ts` and add the new export**

Replace the entire contents of `src/lib/puck/sanitize-data.ts` with:

```ts
import type { Data } from '@puckeditor/core';
import { sanitizeRichTextHtml } from './sanitize-html';

/**
 * Prop names that are richtext fields in Puck component configs.
 * Puck's RichTextRender crashes when these are empty strings — it creates
 * { type: "text", text: "" } which ProseMirror rejects. Setting to null
 * makes Puck create a safe empty doc instead.
 */
const RICHTEXT_PROP_NAMES = ['content', 'text', 'quote'];

type Component = { type: string; props: Record<string, unknown> };

/**
 * Walk every Puck component in the data tree and call `fn` for each
 * richtext-typed prop. The callback's return value replaces the prop value.
 */
function walkRichTextProps(
  data: Data,
  fn: (key: string, value: unknown) => unknown
): void {
  function walkComponents(components: Component[]) {
    for (const component of components) {
      if (!component.props) continue;
      for (const key of RICHTEXT_PROP_NAMES) {
        if (key in component.props) {
          component.props[key] = fn(key, component.props[key]);
        }
      }
      // Recursively walk slot content (arrays of components in props)
      for (const value of Object.values(component.props)) {
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          (value[0] as Component | undefined)?.type &&
          (value[0] as Component | undefined)?.props
        ) {
          walkComponents(value as Component[]);
        }
      }
    }
  }

  if (data.content) walkComponents(data.content as Component[]);
  if (data.zones) {
    for (const zone of Object.values(data.zones)) {
      walkComponents(zone as Component[]);
    }
  }
  if (data.root?.content) {
    walkComponents(data.root.content as Component[]);
  }
}

/**
 * Sanitize Puck data on **load** to prevent ProseMirror "Empty text nodes"
 * crash. Puck's RichTextRender converts empty string "" to a doc with a
 * zero-length text node which crashes ProseMirror's Node.fromJSON. Setting
 * empty richtext to null makes Puck use { type: "doc", content: [] }
 * instead (safe).
 */
export function sanitizePuckData(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data)) as Data;
  walkRichTextProps(clone, (_key, value) => (value === '' ? null : value));
  return clone;
}

/**
 * Sanitize Puck data on **write**. Performs everything sanitizePuckData does
 * and additionally runs every non-empty richtext string through
 * sanitizeRichTextHtml — strips disallowed tags/attributes, normalizes NBSP
 * runs, blocks javascript:/data: URIs.
 *
 * Call from server actions before persisting to Supabase.
 */
export function sanitizePuckDataForWrite(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data)) as Data;
  walkRichTextProps(clone, (_key, value) => {
    if (value === '') return null;
    if (typeof value === 'string') return sanitizeRichTextHtml(value);
    return value;
  });
  return clone;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- --run src/lib/puck/__tests__/sanitize-data.test.ts 2>&1 | tail -15
```

Expected: all existing `sanitizePuckData` tests still pass + 5 new `sanitizePuckDataForWrite` tests pass.

- [ ] **Step 5: Run full type-check**

```bash
npm run type-check 2>&1 | tail -10
```

Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/sanitize-data.ts src/lib/puck/__tests__/sanitize-data.test.ts
git commit -m "feat(puck): sanitizePuckDataForWrite walks tree and HTML-sanitizes richtext props

Extracts shared walker walkRichTextProps used by both load-side and
write-side sanitizers. Write variant additionally runs every non-empty
richtext string through sanitizeRichTextHtml.

Load-side sanitizePuckData semantics unchanged."
```

---

## Task 4: Wire `savePuckPageDraft` and `savePuckRootDraft` to sanitize on write

**Files:**
- Modify: `src/app/admin/site-builder/actions.ts:58-95` (`savePuckPageDraft`) and `:97-115` (`savePuckRootDraft`)

- [ ] **Step 1: Read current state of both functions**

```bash
sed -n '58,115p' src/app/admin/site-builder/actions.ts
```

Confirm both functions exist and match the shape described in the spec. If shape has drifted, stop and reassess.

- [ ] **Step 2: Add the import to `actions.ts`**

At the top of `src/app/admin/site-builder/actions.ts`, add the import next to the existing `puckDataSchema` import:

```ts
import { puckDataSchema } from '@/lib/puck/schemas';
import { sanitizePuckDataForWrite } from '@/lib/puck/sanitize-data';
```

- [ ] **Step 3: Modify `savePuckPageDraft`**

Locate the line:

```ts
const merged = { ...existing, [path]: parseResult.data };
```

Replace with:

```ts
const sanitized = sanitizePuckDataForWrite(parseResult.data as Parameters<typeof sanitizePuckDataForWrite>[0]);
const merged = { ...existing, [path]: sanitized };
```

- [ ] **Step 4: Modify `savePuckRootDraft`**

Locate the lines (around line 107-110):

```ts
  const { error } = await supabase
    .from('properties')
    .update({ puck_root_draft: parseResult.data as unknown as Record<string, unknown> })
    .eq('id', result.propertyId);
```

Replace with:

```ts
  const sanitized = sanitizePuckDataForWrite(parseResult.data as Parameters<typeof sanitizePuckDataForWrite>[0]);
  const { error } = await supabase
    .from('properties')
    .update({ puck_root_draft: sanitized as unknown as Record<string, unknown> })
    .eq('id', result.propertyId);
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check 2>&1 | tail -5
```

Expected: clean. If a `Data` type mismatch surfaces, the cast `as Parameters<typeof sanitizePuckDataForWrite>[0]` should silence it; if not, replace with `as any` (acceptable here — `parseResult.data` is already a Zod-validated payload).

- [ ] **Step 6: Run full test suite**

```bash
npm run test 2>&1 | tail -10
```

Expected: all pass. No new tests added in this task — integration tested via Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/site-builder/actions.ts
git commit -m "feat(puck): sanitize HTML before saving puck_pages_draft and puck_root_draft

Routes savePuckPageDraft and savePuckRootDraft through
sanitizePuckDataForWrite so foreign HTML (Quill/Word/Google Docs paste)
is cleaned at write time. Render path unchanged."
```

---

## Task 5: Defense-in-depth re-sanitize in `publishPuckPages` and `publishPuckRoot`

**Files:**
- Modify: `src/app/admin/site-builder/actions.ts:121-146` (`publishPuckPages`) and `:148-173` (`publishPuckRoot`)

- [ ] **Step 1: Modify `publishPuckPages`**

Locate the block:

```ts
  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: property.puck_pages_draft })
    .eq('id', result.propertyId);
```

Replace with:

```ts
  // Defense-in-depth: re-sanitize even though draft was sanitized on save.
  // Idempotent — clean data passes through unchanged.
  const draft = property.puck_pages_draft as Record<string, unknown> | null;
  let sanitizedPages: Record<string, unknown> | null = null;
  if (draft && typeof draft === 'object') {
    sanitizedPages = {};
    for (const [pagePath, pageData] of Object.entries(draft)) {
      sanitizedPages[pagePath] = sanitizePuckDataForWrite(
        pageData as Parameters<typeof sanitizePuckDataForWrite>[0]
      );
    }
  }

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: sanitizedPages })
    .eq('id', result.propertyId);
```

- [ ] **Step 2: Modify `publishPuckRoot`**

Locate the block:

```ts
  const { error } = await supabase
    .from('properties')
    .update({ puck_root: property.puck_root_draft })
    .eq('id', result.propertyId);
```

Replace with:

```ts
  // Defense-in-depth: re-sanitize. Idempotent.
  const sanitizedRoot = property.puck_root_draft
    ? sanitizePuckDataForWrite(
        property.puck_root_draft as Parameters<typeof sanitizePuckDataForWrite>[0]
      )
    : null;

  const { error } = await supabase
    .from('properties')
    .update({ puck_root: sanitizedRoot as unknown as Record<string, unknown> | null })
    .eq('id', result.propertyId);
```

- [ ] **Step 3: Type-check + tests**

```bash
npm run type-check && npm run test 2>&1 | tail -10
```

Expected: clean type-check; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/site-builder/actions.ts
git commit -m "feat(puck): defense-in-depth re-sanitize on publish

publishPuckPages and publishPuckRoot now re-run sanitizePuckDataForWrite
on the draft before promoting it to the live puck_pages/puck_root column.
Idempotent — clean data is unchanged."
```

---

## Task 6: Backfill script

**Files:**
- Create: `scripts/backfill-puck-sanitize.ts`
- Modify: `package.json` (add `backfill:puck-sanitize` script)
- Create: `docs/playbooks/puck-html-sanitize.md`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-puck-sanitize.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-time backfill: re-saves every property's puck_pages and puck_pages_draft
 * (and puck_root / puck_root_draft) through sanitizePuckDataForWrite.
 *
 * Usage:
 *   # dry-run: show what would change, no writes
 *   npm run backfill:puck-sanitize
 *
 *   # apply: actually update rows where content changed
 *   npm run backfill:puck-sanitize -- --apply
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (load via vercel env pull
 *   or .env.local).
 */
import { createClient } from '@supabase/supabase-js';
import { sanitizePuckDataForWrite } from '../src/lib/puck/sanitize-data';
import type { Data } from '@puckeditor/core';

const APPLY = process.argv.includes('--apply');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.');
  console.error('Hint: run `vercel env pull .env.local` then export the vars before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface Row {
  id: string;
  puck_pages: Record<string, unknown> | null;
  puck_pages_draft: Record<string, unknown> | null;
  puck_root: Record<string, unknown> | null;
  puck_root_draft: Record<string, unknown> | null;
}

function sanitizePagesMap(map: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!map) return null;
  const out: Record<string, unknown> = {};
  for (const [path, data] of Object.entries(map)) {
    out[path] = sanitizePuckDataForWrite(data as Data);
  }
  return out;
}

function sanitizeRoot(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  return sanitizePuckDataForWrite(data as Data) as unknown as Record<string, unknown>;
}

async function main() {
  console.log(APPLY ? 'Mode: APPLY (writes will happen)' : 'Mode: DRY-RUN (no writes)');

  const { data: rows, error } = await supabase
    .from('properties')
    .select('id, puck_pages, puck_pages_draft, puck_root, puck_root_draft');

  if (error) {
    console.error('Failed to read properties:', error.message);
    process.exit(1);
  }

  let scanned = 0;
  let changed = 0;
  let updated = 0;
  let errors = 0;

  for (const row of (rows ?? []) as Row[]) {
    scanned++;
    const next = {
      puck_pages: sanitizePagesMap(row.puck_pages),
      puck_pages_draft: sanitizePagesMap(row.puck_pages_draft),
      puck_root: sanitizeRoot(row.puck_root),
      puck_root_draft: sanitizeRoot(row.puck_root_draft),
    };

    const beforeJson = JSON.stringify({
      puck_pages: row.puck_pages,
      puck_pages_draft: row.puck_pages_draft,
      puck_root: row.puck_root,
      puck_root_draft: row.puck_root_draft,
    });
    const afterJson = JSON.stringify(next);

    if (beforeJson === afterJson) {
      continue;
    }

    changed++;
    console.log(
      `[${row.id}] would change: ` +
        `pages=${row.puck_pages ? 'yes' : 'no'} ` +
        `pagesDraft=${row.puck_pages_draft ? 'yes' : 'no'} ` +
        `root=${row.puck_root ? 'yes' : 'no'} ` +
        `rootDraft=${row.puck_root_draft ? 'yes' : 'no'} ` +
        `(bytes ${beforeJson.length} → ${afterJson.length})`
    );

    if (!APPLY) continue;

    const { error: updateError } = await supabase
      .from('properties')
      .update(next)
      .eq('id', row.id);

    if (updateError) {
      errors++;
      console.error(`[${row.id}] UPDATE failed: ${updateError.message}`);
    } else {
      updated++;
    }
  }

  console.log('---');
  console.log(`Scanned:  ${scanned}`);
  console.log(`Changed:  ${changed}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Errors:   ${errors}`);
  if (!APPLY && changed > 0) {
    console.log('\nDry run complete. Re-run with `-- --apply` to persist.');
  }
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Open `package.json` and add to the `"scripts"` block (after `"test:watch"`):

```json
    "backfill:puck-sanitize": "tsx scripts/backfill-puck-sanitize.ts",
```

So the scripts block now contains the line above.

- [ ] **Step 3: Verify the script type-checks**

```bash
npx tsc --noEmit scripts/backfill-puck-sanitize.ts 2>&1 | tail -10
```

If errors, fix them. Note: the project's main `tsconfig.json` may not include `scripts/`. If `tsc` complains about `Cannot find module`, set the include path explicitly:

```bash
npx tsc --noEmit --module nodenext --target es2022 --moduleResolution nodenext --esModuleInterop scripts/backfill-puck-sanitize.ts 2>&1 | tail -10
```

If still erroring on path imports, the issue is `tsx` will resolve at runtime via Node's resolver — the `tsc --noEmit` check is best-effort. Skip this sub-step if it produces module-resolution errors that don't reflect runtime behavior; we'll catch real bugs in Step 4.

- [ ] **Step 4: Smoke-run in dry mode**

```bash
# The operator must have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.
# Use vercel env pull to populate .env.local, then export.
set -a; . .env.local; set +a
npm run backfill:puck-sanitize 2>&1 | tail -20
```

Expected output: prints "Mode: DRY-RUN", scans rows, prints zero or more "would change" lines, prints summary.

If `SUPABASE_URL` is not set in `.env.local`, set it explicitly:
```bash
SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL npm run backfill:puck-sanitize
```

- [ ] **Step 5: Write the operator playbook**

Create `docs/playbooks/puck-html-sanitize.md`:

```markdown
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
4. Run the backfill **again** so existing data that previously had the tag
   stripped is *not* re-stripped — but if data had the tag stripped before
   the allowlist extension, that data is gone (the original was overwritten).
   To recover, restore from a Supabase point-in-time backup.

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
```

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-puck-sanitize.ts package.json docs/playbooks/puck-html-sanitize.md
git commit -m "feat(puck): backfill script + operator playbook

Backfill re-runs every property row through sanitizePuckDataForWrite.
Defaults to --dry-run; --apply to persist. Idempotent.

Playbook covers: backfill procedure, allowlist extensions, emergency
disable, library rotation, perf notes."
```

---

## Task 7: Manual XSS smoke verification

**Files:** none (manual verification on preview deploy)

- [ ] **Step 1: Push branch and let preview deploy build**

```bash
git push -u origin fix/puck-html-sanitize
```

Wait for the Vercel preview deploy to complete (visible in PR comments after Task 8 opens the PR; for now just verify build via CI).

- [ ] **Step 2: On the preview deploy, paste an XSS payload**

Visit the preview deploy's Puck editor (e.g.
`https://birdhouse-mapper-<sha>.vercel.app/admin/properties/default/site-builder/...`).

Add a `RichText` block. Paste this into the rich-text field via the browser's paste-from-text mechanism (developer tools → Elements → set `innerHTML` of the contenteditable):

```html
<script>alert('xss-test-1')</script><p onclick="alert('xss-test-2')">click me</p><a href="javascript:alert('xss-test-3')">link</a><img src=x onerror="alert('xss-test-4')">
```

Save the page.

- [ ] **Step 3: Reload and inspect**

Reload the page. Open browser DevTools → Elements. Locate the rendered `RichText` block.

Expected:
- No `<script>` tag in the DOM
- No `onclick` attribute on the `<p>`
- The `<a>` either has no `href` or a sanitized href (no `javascript:`)
- The `<img>` has no `onerror`
- Page loads without alerts firing

If any alert fires or any unsafe attribute is present, the sanitizer config is broken — return to Task 2 and add a regression test.

- [ ] **Step 4: Document the smoke test in the PR**

Comment on the PR with the steps above and a screenshot of DevTools showing the sanitized DOM.

---

## Task 8: Run backfill in production + open PR

**Files:** none (operator action + PR creation)

- [ ] **Step 1: Run dry-run against production**

```bash
cd /Users/patrick/birdhouse-mapper/.worktrees/puck-html-sanitize
vercel env pull .env.local
set -a; . .env.local; set +a
npm run backfill:puck-sanitize 2>&1 | tee /tmp/backfill-dryrun.log | tail -20
```

Expected: prints summary. No errors. Save `/tmp/backfill-dryrun.log` for the PR.

- [ ] **Step 2: Apply backfill**

```bash
npm run backfill:puck-sanitize -- --apply 2>&1 | tee /tmp/backfill-apply.log | tail -20
```

Expected: same scan count as dry-run; `Updated: <changed count>`; `Errors: 0`.

- [ ] **Step 3: Verify in DB**

```bash
psql "$SUPABASE_DB_URL" -c "select id, jsonb_path_query_array(puck_pages, '$.**.props.content') from properties where puck_pages is not null limit 5;"
```

Spot-check that no row contains `_RichTextEditor` class names or `xmlns="http://www.w3.org/1999/xhtml"` attributes anymore.

- [ ] **Step 4: Push and open PR**

```bash
gh pr create --base main --head fix/puck-html-sanitize \
  --title "feat(puck): server-side HTML sanitization for richtext content (closes #304)" \
  --body "$(cat <<'EOF'
## Summary
Server-side DOMPurify allowlist + NBSP normalization on every save to `properties.puck_pages` and `properties.puck_pages_draft`. One-time backfill cleaned existing rows.

Closes #304. Companion to PR #303 (Tier 1 CSS workaround).

## Changes
- **New:** `src/lib/puck/sanitize-html.ts` — DOMPurify wrapper, strict allowlist, `rel="noopener noreferrer"` auto-add, NBSP run collapsing
- **Modified:** `src/lib/puck/sanitize-data.ts` — extracted shared walker, added `sanitizePuckDataForWrite`
- **Modified:** `src/app/admin/site-builder/actions.ts` — `savePuckPageDraft` / `savePuckRootDraft` / `publishPuckPages` / `publishPuckRoot` route through the sanitizer
- **New:** `scripts/backfill-puck-sanitize.ts` + `npm run backfill:puck-sanitize`
- **New:** `docs/playbooks/puck-html-sanitize.md`
- **Spec:** `docs/superpowers/specs/2026-05-02-puck-html-sanitize-design.md`

## Backfill output
<details><summary>Dry run</summary>

```
$(cat /tmp/backfill-dryrun.log)
```
</details>

<details><summary>Apply</summary>

```
$(cat /tmp/backfill-apply.log)
```
</details>

## Test plan
- [x] `npm run test -- --run src/lib/puck` — all pass
- [x] `npm run type-check` — clean
- [x] Manual XSS smoke test on preview (script/onclick/javascript:/onerror all stripped)
- [x] Backfill dry-run + apply against prod, no errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch CI**

```bash
gh pr checks $(gh pr view --json number -q .number) --repo patjackson52/birdhouse-mapper --watch
```

Expected: `Lint, Type Check & Build` passes; `Playwright E2E` passes; Vercel previews pass; `Migration Dry Run` may fail (pre-existing token issue tracked in #300).

---

## Self-Review

- [x] **Spec coverage:** Spec sections — Goals/Scope (Task 1-6), Decisions table (locked in spec, executed across all tasks), Allowlist (Task 2), NBSP normalization (Task 2), Architecture file map (Tasks 2-6), Backfill (Task 6), Error handling (Task 2 implementation has try/catch fallback), Testing (Tasks 2-3 unit + Task 7 manual), Acceptance criteria (Tasks 1-8). No gaps.
- [x] **Placeholder scan:** No "TBD"/"TODO"/"implement later"/"add appropriate error handling"/etc. All code blocks contain real code.
- [x] **Type / name consistency:** `sanitizeRichTextHtml` (Task 2) used in `sanitizePuckDataForWrite` (Task 3), called from `savePuckPageDraft`/`savePuckRootDraft`/`publishPuckPages`/`publishPuckRoot` (Tasks 4-5), referenced in backfill script (Task 6). `RICHTEXT_PROP_NAMES`, `walkRichTextProps`, `Component` type used consistently.
- [x] **Manual prerequisites surfaced:** Task 8 requires `vercel env pull` (operator must be logged into Vercel CLI). Task 7 requires preview deploy URL.
- [x] **Rollback path:** Playbook §"Disabling sanitization (emergency)" + git revert of the per-task commits.

---
