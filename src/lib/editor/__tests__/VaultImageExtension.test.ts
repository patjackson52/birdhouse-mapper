import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';

function createEditor(content?: string) {
  return new Editor({
    extensions: [Document, Paragraph, Text, VaultImage],
    content: content ?? '<p>Hello</p>',
  });
}

const baseExtensions = [Document, Paragraph, Text, VaultImage];

type NodeWithAttrs = { type: string; attrs?: Record<string, any>; content?: NodeWithAttrs[] };

function findVaultImage(doc: ReturnType<Editor['getJSON']>): NodeWithAttrs | undefined {
  const topLevel = doc.content as NodeWithAttrs[] | undefined;
  const direct = topLevel?.find((n) => n.type === 'vaultImage');
  if (direct) return direct;
  return topLevel?.[0]?.content?.find((n) => n.type === 'vaultImage');
}

describe('VaultImageExtension - layout attribute', () => {
  it('defaults layout to "default"', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    const imgNode = findVaultImage(editor.getJSON());
    expect(imgNode?.attrs?.layout).toBe('default');
    editor.destroy();
  });

  it('parses float:left style into float-left layout', () => {
    const editor = createEditor('<p><img src="a.jpg" style="float:left" /></p>');
    const imgNode = findVaultImage(editor.getJSON());
    expect(imgNode?.attrs?.layout).toBe('float-left');
    editor.destroy();
  });

  it('parses float:right style into float-right layout', () => {
    const editor = createEditor('<p><img src="a.jpg" style="float:right" /></p>');
    const imgNode = findVaultImage(editor.getJSON());
    expect(imgNode?.attrs?.layout).toBe('float-right');
    editor.destroy();
  });

  it('parses data-layout from a figure wrapper', () => {
    const editor = createEditor(
      '<figure data-layout="centered"><img src="a.jpg" /></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.layout).toBe('centered');
    editor.destroy();
  });

  it('renders float-left as data-layout on figure in HTML output', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'float-left', caption: null },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('data-layout="float-left"');
    expect(html).toContain('<figure');
    expect(html).toContain('<img');
    expect(html).not.toContain('<figcaption');
  });

  it('renders caption as figcaption in HTML output', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: 'Eagle in flight' },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('<figcaption>Eagle in flight</figcaption>');
  });

  it('parses caption from figcaption inside figure', () => {
    const editor = createEditor(
      '<figure data-layout="default"><img src="a.jpg" /><figcaption>Test cap</figcaption></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.caption).toBe('Test cap');
    editor.destroy();
  });
});

describe('VaultImageExtension - widthPercent attribute', () => {
  it('defaults widthPercent to null', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    const imgNode = findVaultImage(editor.getJSON());
    expect(imgNode?.attrs?.widthPercent).toBeNull();
    editor.destroy();
  });

  it('parses data-width-percent from figure', () => {
    const editor = createEditor(
      '<figure data-width-percent="50"><img src="a.jpg" /></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.widthPercent).toBe(50);
    editor.destroy();
  });

  it('renders widthPercent as data-width-percent on figure', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: 66 },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('data-width-percent="66"');
  });

  it('does not render data-width-percent when null', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).not.toContain('data-width-percent');
  });
});
