import { describe, it, expect } from 'vitest';
import { puckDataSchema } from '@/lib/puck/schemas';
import { buildPuckGenerationPrompt } from '../generate';

describe('buildPuckGenerationPrompt', () => {
  it('includes component schemas in system prompt', () => {
    const prompt = buildPuckGenerationPrompt({
      siteName: 'Test Reserve',
      tagline: 'Wildlife monitoring',
      locationName: 'Pacific Northwest',
      stats: { items: 42, species: 12, updates: 128 },
    });
    expect(prompt).toContain('Hero');
    expect(prompt).toContain('RichText');
    expect(prompt).toContain('Stats');
    expect(prompt).toContain('Test Reserve');
  });

  it('includes site stats in the prompt', () => {
    const prompt = buildPuckGenerationPrompt({
      siteName: 'My Reserve',
      tagline: 'Conservation first',
      locationName: 'Oregon',
      stats: { items: 99, species: 7, updates: 300 },
    });
    expect(prompt).toContain('99');
    expect(prompt).toContain('7');
    expect(prompt).toContain('300');
    expect(prompt).toContain('Oregon');
  });

  it('includes all required component names', () => {
    const prompt = buildPuckGenerationPrompt({
      siteName: 'Reserve',
      tagline: 'Tag',
      locationName: 'Location',
      stats: { items: 0, species: 0, updates: 0 },
    });
    const components = ['ButtonGroup', 'Gallery', 'Spacer', 'Card', 'Testimonial', 'MapPreview', 'Columns', 'Section'];
    for (const name of components) {
      expect(prompt).toContain(name);
    }
  });

  it('includes output format guidance', () => {
    const prompt = buildPuckGenerationPrompt({
      siteName: 'Reserve',
      tagline: 'Tag',
      locationName: 'Location',
      stats: { items: 0, species: 0, updates: 0 },
    });
    expect(prompt).toContain('root');
    expect(prompt).toContain('content');
  });
});

describe('AI output validation', () => {
  it('accepts well-formed Puck generation output', () => {
    const generated = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: {
            title: 'Welcome',
            subtitle: 'Hi',
            backgroundImageUrl: '',
            overlay: 'primary',
            ctaLabel: 'Go',
            ctaHref: '/map',
          },
        },
        { type: 'Stats', props: { source: 'auto', items: [] } },
      ],
    };
    expect(() => puckDataSchema.parse(generated)).not.toThrow();
  });

  it('accepts output with ButtonGroup component', () => {
    const generated = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Welcome', subtitle: '' } },
        { type: 'RichText', props: { content: '## Hello\nWorld', alignment: 'left', columns: 1 } },
        { type: 'ButtonGroup', props: { buttons: [{ label: 'Explore Map', href: '/map', style: 'primary', size: 'lg' }] } },
      ],
    };
    expect(() => puckDataSchema.parse(generated)).not.toThrow();
  });

  it('accepts minimal valid output', () => {
    const generated = {
      root: { props: {} },
      content: [],
    };
    expect(() => puckDataSchema.parse(generated)).not.toThrow();
  });
});
