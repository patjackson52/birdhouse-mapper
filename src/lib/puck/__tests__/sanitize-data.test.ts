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
                  content: [
                    { type: 'text', text: 'Hello world' },
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
    expect(content.content[0].content[0].text).toBe('Hello world');
  });

  it('handles string content (HTML) without modification', () => {
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

  it('sanitizes zone content too', () => {
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
    // Original should be unchanged
    expect(original.content[0].content).toHaveLength(2);
  });
});
