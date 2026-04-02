# Link Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a combobox with grouped suggestions (Pages + Previously Used external links) to the site builder's link fields.

**Architecture:** Enhance the existing `LinkField` component with a dropdown that shows on focus. A `PuckSuggestionsProvider` context supplies live external link data extracted from the current puck draft. Public routes are a static array.

**Tech Stack:** React context, Vitest + @testing-library/react, existing Puck custom field system

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/puck/fields/link-suggestions.ts` | Create | `LinkSuggestion` type, `PUBLIC_ROUTES` array, `extractExternalLinks()` utility |
| `src/lib/puck/fields/__tests__/link-suggestions.test.ts` | Create | Tests for extraction logic |
| `src/lib/puck/fields/PuckSuggestionsProvider.tsx` | Create | React context providing external link suggestions from live puck data |
| `src/lib/puck/fields/LinkField.tsx` | Modify | Replace `<input>` with combobox UI |
| `src/lib/puck/fields/__tests__/LinkField.test.tsx` | Modify | Add combobox behavior tests |
| `src/components/puck/PuckPageEditor.tsx` | Modify | Wrap `<Puck>` in `PuckSuggestionsProvider` |
| `src/components/puck/PuckChromeEditor.tsx` | Modify | Wrap `<Puck>` in `PuckSuggestionsProvider` |
| `src/lib/puck/fields/index.tsx` | Modify | Re-export `PuckSuggestionsProvider` |

---

### Task 1: Link Suggestions — Types and Extraction Logic

**Files:**
- Create: `src/lib/puck/fields/link-suggestions.ts`
- Create: `src/lib/puck/fields/__tests__/link-suggestions.test.ts`

- [ ] **Step 1: Write failing tests for extraction logic**

```typescript
// src/lib/puck/fields/__tests__/link-suggestions.test.ts
import { describe, it, expect } from 'vitest';
import { extractExternalLinks, PUBLIC_ROUTES, type LinkSuggestion } from '../link-suggestions';

describe('PUBLIC_ROUTES', () => {
  it('contains the four public-facing routes', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.href);
    expect(paths).toEqual(['/', '/map', '/about', '/list']);
  });

  it('each route has a label', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.label).toBeTruthy();
    }
  });
});

describe('extractExternalLinks', () => {
  it('returns empty array for empty content', () => {
    const data = { root: { props: {} }, content: [] };
    expect(extractExternalLinks(data)).toEqual([]);
  });

  it('extracts href from LinkValue objects', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: {
            id: 'hero-1',
            title: 'Test',
            ctaHref: { href: 'https://example.com', target: '_blank' },
          },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://example.com', label: 'example.com' }]);
  });

  it('extracts plain string URLs starting with http', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: 'https://troop1564.org/info' },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://troop1564.org/info', label: 'troop1564.org' }]);
  });

  it('ignores internal URLs', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'hero-1', ctaHref: { href: '/map' } },
        },
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: '/about' },
        },
      ],
    };
    expect(extractExternalLinks(data)).toEqual([]);
  });

  it('deduplicates by URL', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'hero-1', ctaHref: { href: 'https://example.com' } },
        },
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: 'https://example.com' },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toHaveLength(1);
  });

  it('extracts links from nested array props (buttons, items)', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'ButtonGroup',
          props: {
            id: 'bg-1',
            buttons: [
              { label: 'Visit', href: { href: 'https://a.com' } },
              { label: 'More', href: { href: 'https://b.com' } },
            ],
          },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.href)).toContain('https://a.com');
    expect(result.map((r) => r.href)).toContain('https://b.com');
  });

  it('extracts links from zones', () => {
    const data = {
      root: { props: {} },
      content: [],
      zones: {
        'Section-1:content': [
          {
            type: 'Card',
            props: { id: 'card-z', linkHref: 'https://zone-link.com' },
          },
        ],
      },
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://zone-link.com', label: 'zone-link.com' }]);
  });

  it('handles malformed data gracefully', () => {
    expect(extractExternalLinks({ root: { props: {} }, content: [] })).toEqual([]);
    expect(extractExternalLinks(null as any)).toEqual([]);
    expect(extractExternalLinks(undefined as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/puck/fields/__tests__/link-suggestions.test.ts`
Expected: FAIL — module `../link-suggestions` not found

- [ ] **Step 3: Implement link-suggestions.ts**

```typescript
// src/lib/puck/fields/link-suggestions.ts

export interface LinkSuggestion {
  href: string;
  label: string;
}

export const PUBLIC_ROUTES: LinkSuggestion[] = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Map' },
  { href: '/about', label: 'About' },
  { href: '/list', label: 'List' },
];

/**
 * Extract deduplicated external URLs from puck data.
 * Walks content and zones, inspects all props for LinkValue objects
 * or plain strings starting with "http".
 */
export function extractExternalLinks(data: any): LinkSuggestion[] {
  if (!data) return [];

  const seen = new Set<string>();
  const results: LinkSuggestion[] = [];

  function addIfExternal(value: unknown) {
    let href: string | undefined;
    if (typeof value === 'string' && value.startsWith('http')) {
      href = value;
    } else if (
      value &&
      typeof value === 'object' &&
      'href' in value &&
      typeof (value as any).href === 'string' &&
      (value as any).href.startsWith('http')
    ) {
      href = (value as any).href;
    }
    if (href && !seen.has(href)) {
      seen.add(href);
      try {
        const hostname = new URL(href).hostname;
        results.push({ href, label: hostname });
      } catch {
        results.push({ href, label: href });
      }
    }
  }

  function walkProps(props: Record<string, unknown>) {
    for (const value of Object.values(props)) {
      if (value === null || value === undefined) continue;
      addIfExternal(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            walkProps(item as Record<string, unknown>);
          }
        }
      }
    }
  }

  function walkComponents(components: any[]) {
    if (!Array.isArray(components)) return;
    for (const component of components) {
      if (component?.props) {
        walkProps(component.props);
      }
    }
  }

  walkComponents(data.content);

  if (data.zones && typeof data.zones === 'object') {
    for (const zoneComponents of Object.values(data.zones)) {
      walkComponents(zoneComponents as any[]);
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/puck/fields/__tests__/link-suggestions.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/fields/link-suggestions.ts src/lib/puck/fields/__tests__/link-suggestions.test.ts
git commit -m "feat: add link suggestion types and extraction logic (#157)"
```

---

### Task 2: PuckSuggestionsProvider Context

**Files:**
- Create: `src/lib/puck/fields/PuckSuggestionsProvider.tsx`
- Modify: `src/lib/puck/fields/index.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/puck/fields/__tests__/PuckSuggestionsProvider.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PuckSuggestionsProvider, useLinkSuggestions } from '../PuckSuggestionsProvider';

function Consumer() {
  const { externalLinks } = useLinkSuggestions();
  return (
    <ul>
      {externalLinks.map((link) => (
        <li key={link.href}>{link.label}</li>
      ))}
    </ul>
  );
}

describe('PuckSuggestionsProvider', () => {
  it('provides empty external links initially', () => {
    const data = { root: { props: {} }, content: [] };
    render(
      <PuckSuggestionsProvider data={data}>
        <Consumer />
      </PuckSuggestionsProvider>
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('extracts external links from data', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'h1', ctaHref: { href: 'https://example.com' } },
        },
      ],
    };
    render(
      <PuckSuggestionsProvider data={data}>
        <Consumer />
      </PuckSuggestionsProvider>
    );
    expect(screen.getByText('example.com')).toBeDefined();
  });

  it('useLinkSuggestions returns empty when used outside provider', () => {
    render(<Consumer />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/puck/fields/__tests__/PuckSuggestionsProvider.test.tsx`
Expected: FAIL — module `../PuckSuggestionsProvider` not found

- [ ] **Step 3: Implement PuckSuggestionsProvider**

```typescript
// src/lib/puck/fields/PuckSuggestionsProvider.tsx
'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { extractExternalLinks, type LinkSuggestion } from './link-suggestions';

interface SuggestionsContextValue {
  externalLinks: LinkSuggestion[];
}

const SuggestionsContext = createContext<SuggestionsContextValue>({
  externalLinks: [],
});

interface PuckSuggestionsProviderProps {
  data: any;
  children: ReactNode;
}

export function PuckSuggestionsProvider({ data, children }: PuckSuggestionsProviderProps) {
  const externalLinks = useMemo(() => extractExternalLinks(data), [data]);

  const value = useMemo(() => ({ externalLinks }), [externalLinks]);

  return (
    <SuggestionsContext.Provider value={value}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useLinkSuggestions(): SuggestionsContextValue {
  return useContext(SuggestionsContext);
}
```

- [ ] **Step 4: Add re-export to index.tsx**

Add to `src/lib/puck/fields/index.tsx`:

```typescript
export { PuckSuggestionsProvider, useLinkSuggestions } from './PuckSuggestionsProvider';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/lib/puck/fields/__tests__/PuckSuggestionsProvider.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/fields/PuckSuggestionsProvider.tsx src/lib/puck/fields/__tests__/PuckSuggestionsProvider.test.tsx src/lib/puck/fields/index.tsx
git commit -m "feat: add PuckSuggestionsProvider context (#157)"
```

---

### Task 3: LinkField Combobox UI

**Files:**
- Modify: `src/lib/puck/fields/LinkField.tsx`
- Modify: `src/lib/puck/fields/__tests__/LinkField.test.tsx`

- [ ] **Step 1: Write failing tests for combobox behavior**

Add the following tests to the existing `src/lib/puck/fields/__tests__/LinkField.test.tsx`. Keep all existing tests unchanged — add a new `describe('combobox', ...)` block after the existing tests:

```typescript
// Add these imports at the top (merge with existing):
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkField } from '../LinkField';
import { PuckSuggestionsProvider } from '../PuckSuggestionsProvider';

// Add after existing vi.mock('../ColorPickerField', ...) block:
vi.mock('../link-suggestions', async () => {
  const actual = await vi.importActual('../link-suggestions');
  return {
    ...actual,
    PUBLIC_ROUTES: [
      { href: '/', label: 'Home' },
      { href: '/map', label: 'Map' },
      { href: '/about', label: 'About' },
    ],
  };
});

// Add this new describe block after existing tests:
describe('combobox', () => {
  it('opens dropdown on focus showing page suggestions', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Map')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
  });

  it('closes dropdown on Escape', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters suggestions by typing', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ma' } });
    expect(screen.getByText('Map')).toBeDefined();
    expect(screen.queryByText('About')).toBeNull();
  });

  it('selects a suggestion on click and closes dropdown', async () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Map'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/map' })
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects suggestion with Enter key', async () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/' })
    );
  });

  it('auto-sets target _blank for external URL suggestions', async () => {
    const puckData = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'c1', linkHref: 'https://example.com' },
        },
      ],
    };
    const onChange = vi.fn();
    render(
      <PuckSuggestionsProvider data={puckData}>
        <LinkField value="" onChange={onChange} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('example.com'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.com', target: '_blank' })
    );
  });

  it('shows only pages group when no provider', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.queryByText('Previously Used')).toBeNull();
  });

  it('shows Previously Used group when provider has external links', async () => {
    const puckData = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'c1', linkHref: 'https://example.com' },
        },
      ],
    };
    render(
      <PuckSuggestionsProvider data={puckData}>
        <LinkField value="" onChange={vi.fn()} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.getByText('Previously Used')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npm test -- --run src/lib/puck/fields/__tests__/LinkField.test.tsx`
Expected: Existing 6 tests pass, new 7 combobox tests FAIL (no `role="combobox"` on the input yet)

- [ ] **Step 3: Implement combobox in LinkField.tsx**

Replace the entire content of `src/lib/puck/fields/LinkField.tsx`:

```typescript
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LinkValue } from './link-utils';
import { resolveLink } from './link-utils';
import { ColorPickerField } from './ColorPickerField';
import { PUBLIC_ROUTES, type LinkSuggestion } from './link-suggestions';
import { useLinkSuggestions } from './PuckSuggestionsProvider';

interface LinkFieldProps {
  value: string | LinkValue | undefined;
  onChange: (value: LinkValue) => void;
}

export function LinkField({ value, onChange }: LinkFieldProps) {
  const resolved = resolveLink(value);
  const [href, setHref] = useState(resolved.href);
  const [target, setTarget] = useState<'_blank' | undefined>(resolved.target);
  const [color, setColor] = useState<string | undefined>(resolved.color);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(`linkfield-listbox-${Math.random().toString(36).slice(2, 8)}`).current;

  const { externalLinks } = useLinkSuggestions();

  useEffect(() => {
    const r = resolveLink(value);
    setHref(r.href);
    setTarget(r.target);
    setColor(r.color);
  }, [value]);

  // Build filtered suggestions
  const filteredPages = PUBLIC_ROUTES.filter(
    (r) =>
      !href ||
      r.label.toLowerCase().includes(href.toLowerCase()) ||
      r.href.toLowerCase().includes(href.toLowerCase())
  );

  const filteredExternal = externalLinks.filter(
    (r) =>
      !href ||
      r.label.toLowerCase().includes(href.toLowerCase()) ||
      r.href.toLowerCase().includes(href.toLowerCase())
  );

  const allSuggestions: LinkSuggestion[] = [...filteredPages, ...filteredExternal];

  function emitChange(updates: Partial<LinkValue>) {
    const next: LinkValue = {
      href: updates.href ?? href,
      target: updates.target !== undefined ? updates.target : target,
      color: updates.color !== undefined ? updates.color : color,
    };
    onChange(next);
  }

  function selectSuggestion(suggestion: LinkSuggestion) {
    const isExternal = suggestion.href.startsWith('http');
    const newTarget = isExternal ? '_blank' : target;
    setHref(suggestion.href);
    setTarget(newTarget);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange({
      href: suggestion.href,
      target: newTarget,
      color,
    });
  }

  function handleFocus() {
    setIsOpen(true);
    setActiveIndex(-1);
  }

  function handleBlur(e: React.FocusEvent) {
    // Don't close if focus moves within the container (e.g., clicking a suggestion)
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
    setActiveIndex(-1);
    emitChange({ href });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < allSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < allSuggestions.length) {
          selectSuggestion(allSuggestions[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function handleTargetToggle() {
    const next = target === '_blank' ? undefined : '_blank';
    setTarget(next);
    emitChange({ target: next });
  }

  function handleColorChange(c: string | undefined) {
    setColor(c);
    emitChange({ color: c });
  }

  const showExternal = filteredExternal.length > 0;
  const activeId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search pages or type URL..."
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {isOpen && allSuggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg"
          >
            {filteredPages.length > 0 && (
              <>
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                  Pages
                </li>
                {filteredPages.map((suggestion, i) => {
                  const globalIndex = i;
                  return (
                    <li
                      key={suggestion.href}
                      id={`${listboxId}-option-${globalIndex}`}
                      role="option"
                      aria-selected={activeIndex === globalIndex}
                      className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
                        activeIndex === globalIndex
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>{suggestion.label}</span>
                      <span className="text-[10px] text-gray-400">
                        {suggestion.href}
                      </span>
                    </li>
                  );
                })}
              </>
            )}

            {showExternal && (
              <>
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                  Previously Used
                </li>
                {filteredExternal.map((suggestion, i) => {
                  const globalIndex = filteredPages.length + i;
                  return (
                    <li
                      key={suggestion.href}
                      id={`${listboxId}-option-${globalIndex}`}
                      role="option"
                      aria-selected={activeIndex === globalIndex}
                      className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
                        activeIndex === globalIndex
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>🔗 {suggestion.label}</span>
                      <span className="max-w-[120px] truncate text-[10px] text-gray-400">
                        {suggestion.href}
                      </span>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={target === '_blank'}
            onChange={handleTargetToggle}
            className="rounded border-gray-300"
            aria-label="Open in new tab"
          />
          New tab
        </label>
      </div>

      <ColorPickerField
        value={color}
        onChange={handleColorChange}
        label="Link Color"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run all LinkField tests**

Run: `npm test -- --run src/lib/puck/fields/__tests__/LinkField.test.tsx`
Expected: All 13 tests PASS (6 existing + 7 new combobox tests)

- [ ] **Step 5: Run all puck field tests to check for regressions**

Run: `npm test -- --run src/lib/puck/fields/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/fields/LinkField.tsx src/lib/puck/fields/__tests__/LinkField.test.tsx
git commit -m "feat: upgrade LinkField to combobox with grouped suggestions (#157)"
```

---

### Task 4: Wire Up Editors with PuckSuggestionsProvider

**Files:**
- Modify: `src/components/puck/PuckPageEditor.tsx`
- Modify: `src/components/puck/PuckChromeEditor.tsx`

- [ ] **Step 1: Update PuckPageEditor**

In `src/components/puck/PuckPageEditor.tsx`, add the import and wrap `<Puck>` in the provider. The provider needs the latest data on every change. Track it with a ref updated in `onChange`:

```typescript
'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { pageConfig } from '@/lib/puck/config';
import { savePuckPageDraft, publishPuckPages } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback, useRef } from 'react';

interface PuckPageEditorProps {
  initialData: Data;
  pagePath: string;
}

export function PuckPageEditor({ initialData, pagePath }: PuckPageEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [puckData, setPuckData] = useState<Data>(initialData);

  const handleChange = useCallback(async (data: Data) => {
    setPuckData(data);
    setIsSaving(true);
    await savePuckPageDraft(pagePath, data);
    setIsSaving(false);
  }, [pagePath]);

  const handlePublish = useCallback(async (data: Data) => {
    await savePuckPageDraft(pagePath, data);
    const result = await publishPuckPages();
    if ('error' in result && result.error) {
      alert(`Publish failed: ${result.error}`);
    }
  }, [pagePath]);

  return (
    <div className="h-screen">
      <PuckSuggestionsProvider data={puckData}>
        <Puck
          config={pageConfig}
          data={initialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </PuckSuggestionsProvider>
    </div>
  );
}
```

- [ ] **Step 2: Update PuckChromeEditor**

In `src/components/puck/PuckChromeEditor.tsx`, same pattern:

```typescript
'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { chromeConfig } from '@/lib/puck/chrome-config';
import { savePuckRootDraft, publishPuckRoot } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback } from 'react';

interface PuckChromeEditorProps {
  initialData: Data;
}

export function PuckChromeEditor({ initialData }: PuckChromeEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [puckData, setPuckData] = useState<Data>(initialData);

  const handleChange = useCallback(async (data: Data) => {
    setPuckData(data);
    setIsSaving(true);
    await savePuckRootDraft(data);
    setIsSaving(false);
  }, []);

  const handlePublish = useCallback(async (data: Data) => {
    await savePuckRootDraft(data);
    const result = await publishPuckRoot();
    if ('error' in result) {
      alert(`Publish failed: ${result.error}`);
    }
  }, []);

  return (
    <div className="h-screen">
      <PuckSuggestionsProvider data={puckData}>
        <Puck
          config={chromeConfig}
          data={initialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </PuckSuggestionsProvider>
    </div>
  );
}
```

- [ ] **Step 3: Type check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 4: Run full puck test suite**

Run: `npm test -- --run src/lib/puck/ src/components/puck/`
Expected: All tests PASS

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/puck/PuckPageEditor.tsx src/components/puck/PuckChromeEditor.tsx
git commit -m "feat: wire up PuckSuggestionsProvider in editors (#157)"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 2: Type check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Start dev server (`npm run dev`), navigate to the site builder landing page editor, click on a Hero component's CTA Link field. Verify:
- Dropdown opens on focus
- Pages group shows Home, Map, About, List
- Typing filters suggestions
- Clicking a suggestion fills the input
- Escape closes dropdown
