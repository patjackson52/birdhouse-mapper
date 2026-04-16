import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VaultImageNodeView } from './VaultImageNodeView';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

function detectLayoutFromStyle(element: HTMLElement): ImageLayout | null {
  const style = (element.getAttribute('style') || '').toLowerCase();
  if (style.includes('float:left') || style.includes('float: left')) return 'float-left';
  if (style.includes('float:right') || style.includes('float: right')) return 'float-right';
  const align = element.getAttribute('align');
  if (align === 'center') return 'centered';
  if (style.includes('margin:auto') || style.includes('margin: auto')) return 'centered';
  return null;
}

/**
 * Custom TipTap Image extension that stores a vault item ID, layout, and caption.
 * Renders as <figure class="image-figure" data-layout="..."><img ...><figcaption>...</figcaption></figure>
 */
export const VaultImage = Image.extend({
  name: 'vaultImage',

  parseHTML() {
    return [
      { tag: 'figure img[src]' }, // images wrapped in our figure format
      { tag: 'img[src]' },        // bare images (paste from external sources)
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      'data-layout': layout,
      'data-caption': caption,
      'data-width-percent': widthPercent,
      ...imgAttrs
    } = HTMLAttributes;

    const figureAttrs: Record<string, string> = { class: 'image-figure' };
    if (layout && layout !== 'default') figureAttrs['data-layout'] = layout;
    if (widthPercent) figureAttrs['data-width-percent'] = widthPercent;

    if (caption) {
      return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)], ['figcaption', {}, caption]];
    }
    return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VaultImageNodeView);
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      vaultItemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-vault-item-id'),
        renderHTML: (attributes) => {
          if (!attributes.vaultItemId) return {};
          return { 'data-vault-item-id': attributes.vaultItemId };
        },
      },
      layout: {
        default: 'default' as ImageLayout,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          if (fig) {
            return (fig.getAttribute('data-layout') as ImageLayout) || detectLayoutFromStyle(element) || 'default';
          }
          return detectLayoutFromStyle(element) || 'default';
        },
        renderHTML: (attributes) => {
          if (!attributes.layout || attributes.layout === 'default') return {};
          return { 'data-layout': attributes.layout };
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          return fig?.querySelector?.('figcaption')?.textContent?.trim() || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.caption) return {};
          return { 'data-caption': attributes.caption };
        },
      },
      widthPercent: {
        default: null as number | null,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          const raw = fig?.getAttribute('data-width-percent') ?? element.getAttribute('data-width-percent');
          return raw ? Number(raw) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.widthPercent == null) return {};
          return { 'data-width-percent': String(attributes.widthPercent) };
        },
      },
    };
  },
});
