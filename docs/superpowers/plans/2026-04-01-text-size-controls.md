# Text Size Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable text size field (Small/Medium/Large/XL) to all text-rendering Puck page components via a shared text styles module.

**Architecture:** A new `text-styles.ts` module provides the `TextSize` type, per-component-type Tailwind class maps, and a `textSizeField()` factory. Each of the 6 affected components gets an optional `textSize` prop with a backward-compatible default. Types, configs, and render functions are updated together per component.

**Tech Stack:** TypeScript, Tailwind CSS (prose plugin), Puck editor, Vitest + React Testing Library

---

### Task 1: Create Shared Text Styles Module

**Files:**
- Create: `src/lib/puck/text-styles.ts`
- Create: `src/lib/puck/__tests__/text-styles.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/puck/__tests__/text-styles.test.ts
import { describe, it, expect } from 'vitest';
import {
  proseSizeClasses,
  heroTitleClasses,
  heroSubtitleClasses,
  statValueClasses,
  linkLabelClasses,
  textSizeField,
} from '../text-styles';
import type { TextSize } from '../text-styles';

const allSizes: TextSize[] = ['small', 'medium', 'large', 'xl'];

describe('text-styles', () => {
  it('proseSizeClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(proseSizeClasses[size]).toBeDefined();
      expect(proseSizeClasses[size]).toContain('prose-');
    }
  });

  it('heroTitleClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(heroTitleClasses[size]).toBeDefined();
      expect(heroTitleClasses[size]).toContain('text-');
    }
  });

  it('heroSubtitleClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(heroSubtitleClasses[size]).toBeDefined();
      expect(heroSubtitleClasses[size]).toContain('text-');
    }
  });

  it('statValueClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(statValueClasses[size]).toBeDefined();
      expect(statValueClasses[size]).toContain('text-');
    }
  });

  it('linkLabelClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(linkLabelClasses[size]).toBeDefined();
      expect(linkLabelClasses[size]).toContain('text-');
    }
  });

  it('textSizeField returns a valid Puck select field', () => {
    const field = textSizeField();
    expect(field.type).toBe('select');
    expect(field.label).toBe('Text Size');
    expect(field.options).toHaveLength(4);
    expect(field.options.map((o: { value: string }) => o.value)).toEqual(allSizes);
  });

  it('textSizeField accepts a custom label', () => {
    const field = textSizeField('Quote Size');
    expect(field.label).toBe('Quote Size');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/__tests__/text-styles.test.ts`
Expected: FAIL — module `../text-styles` does not exist

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/puck/text-styles.ts
export type TextSize = 'small' | 'medium' | 'large' | 'xl';

/** Prose-based components: RichText, Card body, Testimonial quote */
export const proseSizeClasses: Record<TextSize, string> = {
  small: 'prose-sm',
  medium: 'prose-base',
  large: 'prose-lg',
  xl: 'prose-xl',
};

/** Hero title */
export const heroTitleClasses: Record<TextSize, string> = {
  small: 'text-2xl md:text-3xl',
  medium: 'text-3xl md:text-4xl',
  large: 'text-4xl md:text-5xl',
  xl: 'text-5xl md:text-6xl',
};

/** Hero subtitle */
export const heroSubtitleClasses: Record<TextSize, string> = {
  small: 'text-base',
  medium: 'text-lg md:text-xl',
  large: 'text-xl md:text-2xl',
  xl: 'text-2xl md:text-3xl',
};

/** Stats value number */
export const statValueClasses: Record<TextSize, string> = {
  small: 'text-xl',
  medium: 'text-2xl',
  large: 'text-3xl',
  xl: 'text-4xl',
};

/** LinkList label text */
export const linkLabelClasses: Record<TextSize, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xl: 'text-xl',
};

/** Reusable Puck field definition for text size */
export function textSizeField(label = 'Text Size') {
  return {
    type: 'select' as const,
    label,
    options: [
      { label: 'Small', value: 'small' as const },
      { label: 'Medium', value: 'medium' as const },
      { label: 'Large', value: 'large' as const },
      { label: 'XL', value: 'xl' as const },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/puck/__tests__/text-styles.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/text-styles.ts src/lib/puck/__tests__/text-styles.test.ts
git commit -m "feat: add shared text-styles module with size maps and field factory"
```

---

### Task 2: Add textSize to RichText

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `RichTextProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for RichText)
- Modify: `src/lib/puck/components/page/RichText.tsx` (use `proseSizeClasses`)
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `RichText` describe block in `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

```typescript
  it('applies prose-lg class by default (no textSize prop)', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-lg');
  });

  it('applies prose-sm class when textSize is small', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} textSize="small" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-sm');
  });

  it('applies prose-xl class when textSize is xl', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} textSize="xl" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-xl');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized / `prose-lg` still hardcoded

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, add the import and update `RichTextProps`:

```typescript
// Add at top of file, after existing imports:
import type { TextSize } from './text-styles';

// Update RichTextProps:
export interface RichTextProps {
  content: string;
  alignment: 'left' | 'center';
  columns: 1 | 2;
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/RichText.tsx`:

```typescript
import type { RichTextProps } from '../../types';
import { proseSizeClasses } from '../../text-styles';

export function RichText({ content, alignment, columns, textSize = 'large' }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';
  const proseSize = proseSizeClasses[textSize];

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className={`prose ${proseSize} max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]`}>
        <RichTextContent content={content} />
      </div>
    </div>
  );
}

/**
 * Renders rich text content. Handles three formats:
 * - ReactNode (from Puck richtext field at edit time)
 * - HTML string (from Puck richtext field when saved)
 * - Plain text / markdown (legacy textarea content)
 */
function RichTextContent({ content }: { content: any }) {
  // ReactNode from Puck richtext field (not a string)
  if (typeof content !== 'string') {
    return <>{content}</>;
  }

  // Empty content
  if (!content) return null;

  // HTML string (from saved richtext data)
  const isHtml = content.startsWith('<') || content.includes('<p>') || content.includes('<h');
  if (isHtml) {
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  // Legacy plain text / markdown
  const ReactMarkdown = require('react-markdown').default;
  const remarkGfm = require('remark-gfm').default;
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}
```

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, add the import at the top:

```typescript
import { textSizeField } from './text-styles';
```

Then update the RichText config entry — add `textSize: 'large'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    RichText: {
      label: 'Rich Text',
      defaultProps: {
        content: '',
        alignment: 'left',
        columns: 1,
        textSize: 'large',
      },
      fields: {
        content: { type: 'richtext', label: 'Content', contentEditable: true },
        textSize: textSizeField(),
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
        },
        columns: {
          type: 'radio',
          label: 'Columns',
          options: [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
          ],
        },
      },
      render: RichText,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: PASS — all RichText tests green (including existing ones)

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/RichText.tsx src/lib/puck/components/page/__tests__/page-components.test.tsx
git commit -m "feat: add textSize field to RichText component"
```

---

### Task 3: Add textSize to Hero

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `HeroProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for Hero)
- Modify: `src/lib/puck/components/page/Hero.tsx` (use `heroTitleClasses` + `heroSubtitleClasses`)
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `Hero` describe block in `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

```typescript
  it('applies large title classes by default (no textSize prop)', () => {
    render(<Hero title="Welcome" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" />);
    const h1 = screen.getByRole('heading', { name: 'Welcome' });
    expect(h1.className).toContain('text-4xl');
  });

  it('applies small title classes when textSize is small', () => {
    render(<Hero title="Welcome" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" textSize="small" />);
    const h1 = screen.getByRole('heading', { name: 'Welcome' });
    expect(h1.className).toContain('text-2xl');
  });

  it('applies xl subtitle classes when textSize is xl', () => {
    render(<Hero title="Welcome" subtitle="Hello world" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" textSize="xl" />);
    const subtitle = screen.getByText('Hello world');
    expect(subtitle.className).toContain('text-2xl');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized on Hero

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, update `HeroProps` (the `TextSize` import already exists from Task 2):

```typescript
export interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
  overlay: 'primary' | 'dark' | 'none';
  ctaLabel: string;
  ctaHref: string | LinkValue;
  icon?: IconValue;
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/Hero.tsx`:

```typescript
import Link from 'next/link';
import type { HeroProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';
import { heroTitleClasses, heroSubtitleClasses } from '../../text-styles';

const overlayClasses = {
  primary: 'bg-[var(--color-primary)]/70',
  dark: 'bg-black/60',
  none: '',
};

export function Hero({ title, subtitle, backgroundImageUrl, overlay, ctaLabel, ctaHref, icon, textSize = 'large' }: HeroProps) {
  const cta = resolveLink(ctaHref);
  return (
    <section
      className="relative flex min-h-[300px] items-center justify-center"
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {!backgroundImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]" />
      )}
      {overlay !== 'none' && (
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      )}
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center text-white">
        {icon && (
          <div className="mb-4 flex justify-center">
            <IconRenderer icon={icon} size={48} className="text-white" />
          </div>
        )}
        {title && <h1 className={`${heroTitleClasses[textSize]} font-bold`}>{title}</h1>}
        {subtitle && <p className={`mt-4 ${heroSubtitleClasses[textSize]} opacity-90`}>{subtitle}</p>}
        {ctaLabel && cta.href && (
          <Link
            href={cta.href}
            target={cta.target}
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-[var(--color-primary-dark)] transition hover:bg-opacity-90"
            style={cta.color ? { color: cta.color } : undefined}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, update the Hero config — add `textSize: 'large'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    Hero: {
      label: 'Hero',
      defaultProps: {
        title: 'Welcome',
        subtitle: '',
        backgroundImageUrl: '',
        overlay: 'primary',
        ctaLabel: '',
        ctaHref: '',
        textSize: 'large',
      },
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        textSize: textSizeField(),
        backgroundImageUrl: imagePickerField('Background Image', fetchLandingAssets),
        overlay: {
          type: 'select',
          label: 'Overlay',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Dark', value: 'dark' },
            { label: 'None', value: 'none' },
          ],
        },
        ctaLabel: { type: 'text', label: 'CTA Label' },
        ctaHref: linkField('CTA Link'),
        icon: iconPickerField('Icon'),
      },
      render: Hero,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: PASS — all Hero tests green

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/Hero.tsx src/lib/puck/components/page/__tests__/page-components.test.tsx
git commit -m "feat: add textSize field to Hero component"
```

---

### Task 4: Add textSize to Card

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `CardProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for Card)
- Modify: `src/lib/puck/components/page/Card.tsx` (use `proseSizeClasses`)
- Modify: `src/lib/puck/components/page/__tests__/new-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `Card` describe block in `src/lib/puck/components/page/__tests__/new-components.test.tsx`:

```typescript
  it('applies prose-sm class by default (no textSize prop)', () => {
    const { container } = render(<Card title="Card" text="<p>Body</p>" imageUrl="" linkHref="" linkLabel="" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-sm');
  });

  it('applies prose-lg class when textSize is large', () => {
    const { container } = render(<Card title="Card" text="<p>Body</p>" imageUrl="" linkHref="" linkLabel="" textSize="large" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-lg');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized on Card

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, update `CardProps`:

```typescript
export interface CardProps {
  imageUrl: string;
  title: string;
  text: string;
  linkHref: string | LinkValue;
  linkLabel: string;
  icon?: IconValue;
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/Card.tsx`:

```typescript
import type { CardProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';
import { proseSizeClasses } from '../../text-styles';

export function Card({ imageUrl, title, text, linkHref, linkLabel, icon, textSize = 'small' }: CardProps) {
  const link = resolveLink(linkHref);
  const proseSize = proseSizeClasses[textSize];
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      {imageUrl && <img src={imageUrl} alt={title} className="h-48 w-full object-cover" loading="lazy" />}
      <div className="p-4">
        {icon && (
          <div className="mb-2">
            <IconRenderer icon={icon} size={24} className="text-[var(--color-primary)]" />
          </div>
        )}
        {title && <h3 className="text-lg font-semibold text-[var(--color-primary-dark)]">{title}</h3>}
        {text && (
          typeof text === 'string'
            ? <div className={`mt-2 text-gray-600 prose ${proseSize} max-w-none`} dangerouslySetInnerHTML={{ __html: text }} />
            : <div className={`mt-2 text-gray-600 prose ${proseSize} max-w-none`}>{text}</div>
        )}
        {link.href && linkLabel && (
          <a
            href={link.href}
            target={link.target}
            className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
            style={link.color ? { color: link.color } : undefined}
          >
            {linkLabel} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
```

Note: The original Card had `text-sm` hardcoded alongside `prose-sm`. The `text-sm` was redundant since `prose-sm` already sets the base size. We remove the redundant `text-sm` and let the prose scale control it.

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, update the Card config — add `textSize: 'small'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    Card: {
      label: 'Card',
      defaultProps: {
        imageUrl: '',
        title: '',
        text: '',
        linkHref: '',
        linkLabel: '',
        textSize: 'small',
      },
      fields: {
        imageUrl: imagePickerField('Image', fetchLandingAssets),
        title: { type: 'text', label: 'Title' },
        text: { type: 'richtext', label: 'Text' },
        textSize: textSizeField(),
        linkHref: linkField('Link URL'),
        linkLabel: { type: 'text', label: 'Link Label' },
        icon: iconPickerField('Icon'),
      },
      render: Card,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx`
Expected: PASS — all Card tests green

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/Card.tsx src/lib/puck/components/page/__tests__/new-components.test.tsx
git commit -m "feat: add textSize field to Card component"
```

---

### Task 5: Add textSize to Stats

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `StatsProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for Stats)
- Modify: `src/lib/puck/components/page/Stats.tsx` (use `statValueClasses`)
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `Stats` describe block in `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

```typescript
  it('applies text-3xl to stat values by default (no textSize prop)', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} />
    );
    const valueEl = container.querySelector('.text-3xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });

  it('applies text-xl to stat values when textSize is small', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} textSize="small" />
    );
    const valueEl = container.querySelector('.text-xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });

  it('applies text-4xl to stat values when textSize is xl', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} textSize="xl" />
    );
    const valueEl = container.querySelector('.text-4xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized on Stats

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, update `StatsProps`:

```typescript
export interface StatsProps {
  source: 'auto' | 'manual';
  items: Array<{
    label: string;
    value: string;
  }>;
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/Stats.tsx`:

```typescript
import type { StatsProps } from '../../types';
import { statValueClasses } from '../../text-styles';

export function Stats({ items, textSize = 'large' }: StatsProps) {
  if (!items?.length) return <></>;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-[var(--color-surface-light)] p-6 text-center">
            <div className={`${statValueClasses[textSize]} font-bold text-[var(--color-primary)]`}>{item.value}</div>
            <div className="mt-1 text-sm text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, update the Stats config — add `textSize: 'large'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    Stats: {
      label: 'Stats',
      defaultProps: {
        source: 'manual',
        items: [],
        textSize: 'large',
      },
      fields: {
        source: {
          type: 'radio',
          label: 'Source',
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Manual', value: 'manual' },
          ],
        },
        items: {
          type: 'array',
          label: 'Items',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: {
            label: 'Stat',
            value: '0',
          },
        },
        textSize: textSizeField(),
      },
      render: Stats,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: PASS — all Stats tests green

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/Stats.tsx src/lib/puck/components/page/__tests__/page-components.test.tsx
git commit -m "feat: add textSize field to Stats component"
```

---

### Task 6: Add textSize to Testimonial

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `TestimonialProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for Testimonial)
- Modify: `src/lib/puck/components/page/Testimonial.tsx` (use `proseSizeClasses`)
- Modify: `src/lib/puck/components/page/__tests__/new-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `Testimonial` describe block in `src/lib/puck/components/page/__tests__/new-components.test.tsx`:

```typescript
  it('applies prose-lg class by default (no textSize prop)', () => {
    const { container } = render(<Testimonial quote="Great" attribution="A" photoUrl="" style="default" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-lg');
  });

  it('applies prose-sm class when textSize is small', () => {
    const { container } = render(<Testimonial quote="Great" attribution="A" photoUrl="" style="default" textSize="small" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-sm');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized on Testimonial

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, update `TestimonialProps`:

```typescript
export interface TestimonialProps {
  quote: string;
  attribution: string;
  photoUrl: string;
  style: 'default' | 'accent';
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/Testimonial.tsx`:

```typescript
import type { TestimonialProps } from '../../types';
import { proseSizeClasses } from '../../text-styles';

const borderClasses = {
  default: 'border-[var(--color-primary)]',
  accent: 'border-[var(--color-accent)]',
};

export function Testimonial({ quote, attribution, photoUrl, style, textSize = 'large' }: TestimonialProps) {
  const proseSize = proseSizeClasses[textSize];
  return (
    <blockquote className={`mx-auto max-w-2xl border-l-4 ${borderClasses[style]} px-4 py-8 pl-6`}>
      <div className={`italic text-gray-700 prose ${proseSize} max-w-none`}>
        &ldquo;{typeof quote === 'string'
          ? <span dangerouslySetInnerHTML={{ __html: quote }} />
          : <span>{quote}</span>
        }&rdquo;
      </div>
      <footer className="mt-4 flex items-center gap-3">
        {photoUrl && <img src={photoUrl} alt={attribution} className="h-10 w-10 rounded-full object-cover" />}
        <cite className="text-sm font-medium not-italic text-gray-600">{attribution}</cite>
      </footer>
    </blockquote>
  );
}
```

Note: The original had `text-lg` alongside `prose-lg` — redundant since prose sets the base size. Removed.

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, update the Testimonial config — add `textSize: 'large'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    Testimonial: {
      label: 'Testimonial',
      defaultProps: {
        quote: '',
        attribution: '',
        photoUrl: '',
        style: 'default',
        textSize: 'large',
      },
      fields: {
        quote: { type: 'richtext', label: 'Quote' },
        attribution: { type: 'text', label: 'Attribution' },
        photoUrl: imagePickerField('Photo', fetchLandingAssets),
        textSize: textSizeField(),
        style: {
          type: 'radio',
          label: 'Style',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Accent', value: 'accent' },
          ],
        },
      },
      render: Testimonial,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx`
Expected: PASS — all Testimonial tests green

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/Testimonial.tsx src/lib/puck/components/page/__tests__/new-components.test.tsx
git commit -m "feat: add textSize field to Testimonial component"
```

---

### Task 7: Add textSize to LinkList

**Files:**
- Modify: `src/lib/puck/types.ts` (add `textSize` to `LinkListProps`)
- Modify: `src/lib/puck/config.ts` (add field + default for LinkList)
- Modify: `src/lib/puck/components/page/LinkList.tsx` (use `linkLabelClasses`)
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to the `LinkList` describe block in `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

```typescript
  it('applies default text size to link labels (no textSize prop)', () => {
    const { container } = render(
      <LinkList items={[{ label: 'Link', url: '/a', description: '' }]} layout="stacked" />
    );
    const label = container.querySelector('span.font-medium') as HTMLElement;
    expect(label).not.toBeNull();
    // Default 'medium' maps to text-base — no explicit class since it's the browser default
  });

  it('applies text-lg class to link labels when textSize is large', () => {
    const { container } = render(
      <LinkList items={[{ label: 'Link', url: '/a', description: '' }]} layout="stacked" textSize="large" />
    );
    const label = container.querySelector('span.font-medium') as HTMLElement;
    expect(label.className).toContain('text-lg');
  });

  it('applies text-sm class to link labels when textSize is small', () => {
    const { container } = render(
      <LinkList items={[{ label: 'Link', url: '/a', description: '' }]} layout="stacked" textSize="small" />
    );
    const label = container.querySelector('span.font-medium') as HTMLElement;
    expect(label.className).toContain('text-sm');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: FAIL — `textSize` prop not recognized on LinkList

- [ ] **Step 3: Update types**

In `src/lib/puck/types.ts`, update `LinkListProps`:

```typescript
export interface LinkListProps {
  items: Array<{
    label: string;
    url: string | LinkValue;
    description: string;
  }>;
  layout: 'inline' | 'stacked';
  textSize?: TextSize;
}
```

- [ ] **Step 4: Update the component**

Replace `src/lib/puck/components/page/LinkList.tsx`:

```typescript
import type { LinkListProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { linkLabelClasses } from '../../text-styles';

export function LinkList({ items, layout, textSize = 'medium' }: LinkListProps) {
  if (!items?.length) return <></>;
  const containerClass =
    layout === 'inline'
      ? 'flex flex-wrap items-center justify-center gap-4'
      : 'flex flex-col gap-3';
  const labelSize = linkLabelClasses[textSize];
  return (
    <div className={`mx-auto max-w-2xl px-4 py-4 ${containerClass}`}>
      {items.map((item, i) => {
        const link = resolveLink(item.url);
        return (
          <a
            key={i}
            href={link.href}
            target={link.target}
            rel="noopener noreferrer"
            className="group block rounded-lg border border-gray-200 p-3 transition hover:border-[var(--color-primary)] hover:shadow-sm"
            style={link.color ? { color: link.color } : undefined}
          >
            <span className={`${labelSize} font-medium text-[var(--color-primary)] group-hover:underline`}>{item.label}</span>
            {item.description && (
              <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Update config**

In `src/lib/puck/config.ts`, update the LinkList config — add `textSize: 'medium'` to `defaultProps` and `textSize: textSizeField()` to `fields`:

```typescript
    LinkList: {
      label: 'Link List',
      defaultProps: {
        items: [],
        layout: 'stacked',
        textSize: 'medium',
      },
      fields: {
        items: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: linkField('URL'),
            description: { type: 'text', label: 'Description' },
          },
          defaultItemProps: {
            label: 'Link',
            url: '#',
            description: '',
          },
        },
        textSize: textSizeField(),
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Inline', value: 'inline' },
            { label: 'Stacked', value: 'stacked' },
          ],
        },
      },
      render: LinkList,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx`
Expected: PASS — all LinkList tests green

- [ ] **Step 7: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/config.ts src/lib/puck/components/page/LinkList.tsx src/lib/puck/components/page/__tests__/page-components.test.tsx
git commit -m "feat: add textSize field to LinkList component"
```

---

### Task 8: Investigate and Fix Rich Text Heading Sizes in Preview

**Files:**
- Possibly modify: `src/lib/puck/components/page/RichText.tsx`
- Possibly modify: CSS/Tailwind config
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx` (if fix changes behavior)

This task requires investigation — the bug is that heading sizes (h1, h2, etc.) in the rich text editor don't visually change in preview mode.

- [ ] **Step 1: Reproduce the issue**

Run: `npm run dev`

Open the site builder, add a RichText component, type heading text and use the rich text toolbar to set it as H1, H2, H3. Check if the headings render at different sizes in the preview pane.

- [ ] **Step 2: Investigate root cause**

Check these likely causes:
1. **Prose classes not applied to edit-time ReactNode content** — When Puck renders in edit mode, `content` is a ReactNode (not a string). Check if the `<div className="prose ...">` wrapper is actually wrapping the content.
2. **CSS specificity** — Tailwind's prose plugin styles may be overridden by Puck's editor styles. Inspect elements in browser DevTools.
3. **Missing prose heading modifiers** — The component uses `prose-headings:text-[var(--color-primary-dark)]` which changes color but not size — sizes come from the base prose class. Check if Puck's editor CSS resets heading sizes.

- [ ] **Step 3: Implement the fix**

Based on investigation, apply the fix. Common solutions:
- If Puck editor CSS overrides prose heading sizes: add specificity via `prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl` modifiers
- If content isn't wrapped in prose: adjust the component structure
- If Tailwind purge removes prose heading classes: ensure they're in the safelist

- [ ] **Step 4: Verify the fix**

Confirm in the browser that heading sizes now render correctly in both:
- Edit mode (Puck editor)
- Preview mode
- Published page view

- [ ] **Step 5: Run all tests**

Run: `npm run test`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: ensure rich text heading sizes render correctly in preview"
```

---

### Task 9: Full Test Suite + Type Check

**Files:** None — verification only

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: PASS — all tests green, no regressions

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS — no TypeScript errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS — successful production build with no errors
