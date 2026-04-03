import { describe, it, expect } from 'vitest';
import {
  proseSizeClasses,
  heroTitleClasses,
  heroSubtitleClasses,
  statValueClasses,
  linkLabelClasses,
  textSizeField,
} from '../text-styles';
import type { TextSize } from '../text-styles';

const allSizes: TextSize[] = ['small', 'medium', 'large', 'xl'];

describe('text-styles', () => {
  it('proseSizeClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(proseSizeClasses[size]).toBeDefined();
      expect(proseSizeClasses[size]).toContain('prose-');
    }
  });

  it('heroTitleClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(heroTitleClasses[size]).toBeDefined();
      expect(heroTitleClasses[size]).toContain('text-');
    }
  });

  it('heroSubtitleClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(heroSubtitleClasses[size]).toBeDefined();
      expect(heroSubtitleClasses[size]).toContain('text-');
    }
  });

  it('statValueClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(statValueClasses[size]).toBeDefined();
      expect(statValueClasses[size]).toContain('text-');
    }
  });

  it('linkLabelClasses has entries for all sizes', () => {
    for (const size of allSizes) {
      expect(linkLabelClasses[size]).toBeDefined();
      expect(linkLabelClasses[size]).toContain('text-');
    }
  });

  it('textSizeField returns a valid Puck select field', () => {
    const field = textSizeField();
    expect(field.type).toBe('select');
    expect(field.label).toBe('Text Size');
    expect(field.options).toHaveLength(4);
    expect(field.options.map((o: { value: string }) => o.value)).toEqual(allSizes);
  });

  it('textSizeField accepts a custom label', () => {
    const field = textSizeField('Quote Size');
    expect(field.label).toBe('Quote Size');
  });
});
