// src/lib/editor/__tests__/LineHeightExtension.test.ts

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { LineHeight } from '../LineHeightExtension';
import { generateHTML } from '@tiptap/html';

function createEditor(content?: string) {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ],
    content: content ?? '<p>Hello world</p>',
  });
}

describe('LineHeightExtension', () => {
  it('registers setLineHeight and unsetLineHeight commands', () => {
    const editor = createEditor();
    expect(typeof editor.commands.setLineHeight).toBe('function');
    expect(typeof editor.commands.unsetLineHeight).toBe('function');
    editor.destroy();
  });

  it('sets lineHeight attribute on the current paragraph', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(1);
    editor.commands.setLineHeight('1.5');
    const json = editor.getJSON();
    expect(json.content?.[0].attrs?.lineHeight).toBe('1.5');
    editor.destroy();
  });

  it('unsets lineHeight attribute', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(1);
    editor.commands.setLineHeight('1.5');
    editor.commands.unsetLineHeight();
    const json = editor.getJSON();
    expect(json.content?.[0].attrs?.lineHeight).toBeNull();
    editor.destroy();
  });

  it('generates HTML with inline line-height style', () => {
    const extensions = [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ];
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { lineHeight: '1.15' }, content: [{ type: 'text', text: 'Tight text' }] },
      ],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('line-height: 1.15');
    expect(html).toContain('Tight text');
  });

  it('does not add style attribute when lineHeight is null', () => {
    const extensions = [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ];
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Default text' }] },
      ],
    };
    const html = generateHTML(json, extensions);
    expect(html).not.toContain('line-height');
  });

  it('parses lineHeight from existing inline styles', () => {
    const editor = createEditor('<p style="line-height: 2.0">Double spaced</p>');
    const json = editor.getJSON();
    // jsdom normalizes "2.0" → "2" when reading element.style.lineHeight
    expect(json.content?.[0].attrs?.lineHeight).toBe('2');
    editor.destroy();
  });
});
