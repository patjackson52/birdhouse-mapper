import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';
import { ImageRow } from '../ImageRowExtension';

const extensions = [Document, Paragraph, Text, VaultImage, ImageRow];

function createEditor(content?: string) {
  return new Editor({ extensions, content: content ?? '<p>Hello</p>' });
}

describe('ImageRow node', () => {
  it('parses div[data-type="image-row"] from HTML', () => {
    const editor = createEditor(
      '<div data-type="image-row"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const row = json.content?.find((n) => n.type === 'imageRow');
    expect(row).toBeDefined();
    expect(row?.content?.length).toBe(2);
    editor.destroy();
  });

  it('renders imageRow as div[data-type="image-row"] in HTML', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'imageRow',
        content: [
          { type: 'vaultImage', attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null } },
          { type: 'vaultImage', attrs: { src: 'b.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null } },
        ],
      }],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('data-type="image-row"');
  });

  it('registers wrapInImageRow command', () => {
    const editor = createEditor();
    expect(typeof editor.commands.wrapInImageRow).toBe('function');
    editor.destroy();
  });
});
