import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';
import { ImageGrid } from '../ImageGridExtension';

const extensions = [Document, Paragraph, Text, VaultImage, ImageGrid];

function createEditor(content?: string) {
  return new Editor({
    extensions,
    content: content ?? '<p>Hello</p>',
  });
}

describe('ImageGridExtension', () => {
  it('defaults columns to 2', () => {
    const editor = createEditor(
      '<div data-type="image-grid"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    expect(grid?.attrs?.columns).toBe(2);
    editor.destroy();
  });

  it('parses data-columns attribute', () => {
    const editor = createEditor(
      '<div data-type="image-grid" data-columns="3"><img src="a.jpg" /><img src="b.jpg" /><img src="c.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid?.attrs?.columns).toBe(3);
    editor.destroy();
  });

  it('parses legacy data-type="image-row" for backward compat', () => {
    const editor = createEditor(
      '<div data-type="image-row"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    expect(grid?.content).toHaveLength(2);
    editor.destroy();
  });

  it('renders as data-type="image-grid" with data-columns', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'imageGrid',
        attrs: { columns: 3 },
        content: [
          { type: 'vaultImage', attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null } },
          { type: 'vaultImage', attrs: { src: 'b.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null } },
        ],
      }],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('data-type="image-grid"');
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('image-grid');
  });

  it('wrapInImageGrid command wraps selected image', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    // vaultImage is a block node lifted to doc level; it lives at position 0
    // vaultImage is block-level and gets lifted; in '<p><img/></p>' the img
    // ends up at offset 2 (after the empty paragraph at offset 0, nodeSize 2)
    editor.commands.setNodeSelection(2);
    const result = editor.chain().wrapInImageGrid().run();
    expect(result).toBe(true);
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    editor.destroy();
  });
});
