import { describe, it, expect } from 'vitest';
import { sanitizePuckData } from '../sanitize-data';
import type { Data } from '@puckeditor/core';

describe('sanitizePuckData', () => {
  it('converts empty string richtext content to null', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: { id: 'rt-1', content: '', alignment: 'left', columns: 1 },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).content).toBeNull();
  });

  it('converts empty string Card text to null', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'c-1', title: 'Hello', text: '', imageUrl: '', linkHref: '', linkLabel: '' },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).text).toBeNull();
  });

  it('converts empty string Testimonial quote to null', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'Testimonial',
          props: { id: 't-1', quote: '', attribution: '', photoUrl: '', style: 'default' },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).quote).toBeNull();
  });

  it('preserves non-empty richtext content', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: { id: 'rt-1', content: '<p>Hello</p>', alignment: 'left', columns: 1 },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).content).toBe('<p>Hello</p>');
  });

  it('preserves non-richtext empty string props', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'h-1', title: '', subtitle: '', backgroundImageUrl: '', overlay: 'none', ctaLabel: '', ctaHref: '' },
        },
      ],
    };

    const result = sanitizePuckData(data);
    expect((result.content[0].props as any).title).toBe('');
    expect((result.content[0].props as any).subtitle).toBe('');
  });

  it('sanitizes components inside zones', () => {
    const data: Data = {
      root: { props: {} },
      content: [],
      zones: {
        'Section-1:content': [
          {
            type: 'RichText',
            props: { id: 'rt-z', content: '', alignment: 'left', columns: 1 },
          },
        ],
      },
    };

    const result = sanitizePuckData(data);
    expect((result.zones!['Section-1:content'][0].props as any).content).toBeNull();
  });

  it('sanitizes components inside slot props (nested arrays)', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'Columns',
          props: {
            id: 'col-1',
            'column-1': [
              {
                type: 'RichText',
                props: { id: 'rt-slot', content: '', alignment: 'left', columns: 1 },
              },
            ],
          },
        },
      ],
    };

    const result = sanitizePuckData(data);
    const slotContent = (result.content[0].props as any)['column-1'];
    expect(slotContent[0].props.content).toBeNull();
  });

  it('does not mutate the original data', () => {
    const data: Data = {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: { id: 'rt-1', content: '', alignment: 'left', columns: 1 },
        },
      ],
    };

    sanitizePuckData(data);
    expect((data.content[0].props as any).content).toBe('');
  });

  it('sanitizes root content (chrome components)', () => {
    const data = {
      root: {
        props: {},
        content: [
          {
            type: 'AnnouncementBar',
            props: { id: 'ab-1', text: '' },
          },
        ],
      },
      content: [],
    } as unknown as Data;

    const result = sanitizePuckData(data);
    expect((result.root as any).content[0].props.text).toBeNull();
  });
});
