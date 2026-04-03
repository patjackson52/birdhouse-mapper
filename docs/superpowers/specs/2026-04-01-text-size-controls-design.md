# Text Size Controls for Puck Editor Components

**Date:** 2026-04-01
**Status:** Approved

## Overview

Add a configurable text size field to all text-rendering Puck page components using a shared text styles module. Also fix the bug where rich text editor heading sizes don't render in preview.

## Shared Text Styles Module

New file: `src/lib/puck/text-styles.ts`

Exports:
- `TextSize` type — `'small' | 'medium' | 'large' | 'xl'`
- Per-component-type size class maps:
  - `proseSizeClasses` — for RichText, Card, Testimonial (`prose-sm` through `prose-xl`)
  - `heroTitleClasses` — Hero title (`text-2xl md:text-3xl` through `text-5xl md:text-6xl`)
  - `heroSubtitleClasses` — Hero subtitle (`text-base` through `text-2xl md:text-3xl`)
  - `statValueClasses` — Stats value (`text-xl` through `text-4xl`)
  - `linkLabelClasses` — LinkList label (`text-sm` through `text-xl`)
- `textSizeField(label?)` — factory function returning a Puck select field definition with the 4 size options

## Component Changes

Each component gets a `textSize` prop (optional, with default matching current hardcoded behavior):

| Component | New prop | Default | Class map used | What changes |
|---|---|---|---|---|
| RichText | `textSize` | `'large'` | `proseSizeClasses` | Replaces hardcoded `prose-lg` |
| Hero | `textSize` | `'large'` | `heroTitleClasses` + `heroSubtitleClasses` | Replaces hardcoded `text-4xl md:text-5xl` / `text-lg md:text-xl` |
| Card | `textSize` | `'small'` | `proseSizeClasses` | Replaces hardcoded `prose-sm` |
| Stats | `textSize` | `'large'` | `statValueClasses` | Replaces hardcoded `text-3xl` |
| Testimonial | `textSize` | `'large'` | `proseSizeClasses` | Replaces hardcoded `prose-lg` |
| LinkList | `textSize` | `'medium'` | `linkLabelClasses` | Replaces hardcoded implicit `text-base` |

**Section** is excluded — it's a wrapper with no text of its own.

## Types Update

`src/lib/puck/types.ts` — add `textSize?: TextSize` to:
- `RichTextProps`
- `HeroProps`
- `CardProps`
- `StatsProps`
- `TestimonialProps`
- `LinkListProps`

The field is optional (`?`) so existing saved page data without the field renders identically using defaults.

## Config Update

`src/lib/puck/config.ts` — for each affected component:
- Add `textSize: 'medium'` (or appropriate default) to `defaultProps`
- Add `textSize: textSizeField()` to `fields`

## Bug Fix: Rich Text Heading Sizes in Preview

Heading sizes (h1, h2, etc.) within the rich text editor don't visually change in preview mode. Investigate and fix during implementation — likely a CSS specificity issue or prose classes not applying to Puck's edit-time rendered content.

## Design Decisions

- **Consistent labels, component-appropriate scales:** All components use the same 4 labels (Small/Medium/Large/XL) but map to different Tailwind classes appropriate for their context (e.g., Hero "Large" = `text-4xl`, Card "Large" = `prose-lg`)
- **Prose scale for rich text components:** Uses Tailwind Typography's prose sizing which proportionally scales all headings, paragraphs, lists — cleanest approach
- **No font weight controls:** Scope limited to text size only for now
- **Backward compatible:** Defaults match current hardcoded values, no migration needed
- **Shared module over inline:** Prevents drift across 6 components, makes global changes easy
