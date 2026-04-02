import { describe, it, expect } from 'vitest';
import { sanitizePuckData } from '../sanitize-data';
import type { Data } from '@puckeditor/core';

describe('sanitizePuckData', () => {
  it('removes empty text nodes from ProseMirror JSON content', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: {
            id: 'rt-1',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: '' },
                    { type: 'text', text: 'Hello' },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = sanitizePuckData(data);
    const content = (result.content[0].props as any).content;
    expect(content.content[0].content).toHaveLength(1);
    expect(content.content[0].content[0].text).toBe('Hello');
  });

  it('preserves valid text nodes', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: {
            id: 'rt-1',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Hello world' }],
                },
              ],
            },
          },
        },
      ],
    };

    const result = sanitizePuckData(data);
    const content = (result.content[0].props as any).content;
    expect(content.content[0].content).toHaveLength(1);
    expect(content.content[0].content[0].text).toBe('Hello world');
  });

  it('handles HTML string content without modification', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: {
            id: 'rt-1',
            content: '<p>Hello</p>',
          },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).content).toBe('<p>Hello</p>');
  });

  it('sanitizes zone content', () => {
    const data: Data = {
      root: { props: {} },
      content: [],
      zones: {
        'Section-1:content': [
          {
            type: 'RichText',
            props: {
              id: 'rt-z',
              content: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '' }],
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const result = sanitizePuckData(data);
    const content = (result.zones!['Section-1:content'][0].props as any).content;
    expect(content.content[0].content).toHaveLength(0);
  });

  it('does not mutate the original data', () => {
    const original = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Keep' },
          ],
        },
      ],
    };

    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: { id: 'rt-1', content: original },
        },
      ],
    };

    sanitizePuckData(data);
    expect(original.content[0].content).toHaveLength(2);
  });

  it('sanitizes stringified ProseMirror JSON in props', () => {
    const pmJson = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Hello' },
          ],
        },
      ],
    });

    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: { id: 'rt-1', content: pmJson },
        },
      ],
    };

    const result = sanitizePuckData(data);
    const content = (result.content[0].props as any).content;
    // Should have been parsed and sanitized — now an object, not a string
    expect(typeof content).toBe('object');
    expect(content.content[0].content).toHaveLength(1);
    expect(content.content[0].content[0].text).toBe('Hello');
  });

  it('removes text nodes with null text', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: {
            id: 'rt-1',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: null },
                    { type: 'text', text: 'Keep' },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = sanitizePuckData(data);
    const content = (result.content[0].props as any).content;
    expect(content.content[0].content).toHaveLength(1);
    expect(content.content[0].content[0].text).toBe('Keep');
  });

  it('sanitizes root props (chrome components)', () => {
    const data = {
      root: {
        props: {
          announcement: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '' }],
              },
            ],
          },
        },
      },
      content: [],
    } as unknown as Data;

    const result = sanitizePuckData(data);
    const announcement = (result.root.props as any).announcement;
    expect(announcement.content[0].content).toHaveLength(0);
  });
});
