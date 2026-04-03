import { describe, it, expect } from 'vitest';
import { generateSlug, generateExcerpt, htmlToPlainText } from '../helpers';

describe('generateSlug', () => {
  it('converts title to lowercase slug with suffix', () => {
    const slug = generateSlug('How to Clean Birdhouses');
    expect(slug).toMatch(/^how-to-clean-birdhouses-[a-z0-9]{4}$/);
  });

  it('strips special characters', () => {
    const slug = generateSlug('BirdBox Plans & Specs!');
    expect(slug).toMatch(/^birdbox-plans-specs-[a-z0-9]{4}$/);
  });

  it('truncates long titles to 60 chars before suffix', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(65);
  });
});

describe('generateExcerpt', () => {
  it('strips HTML and truncates', () => {
    const html = '<p>This is a <strong>test</strong> paragraph.</p>';
    expect(generateExcerpt(html, 20)).toBe('This is a test…');
  });

  it('returns full text if under maxLength', () => {
    const html = '<p>Short text.</p>';
    expect(generateExcerpt(html)).toBe('Short text.');
  });
});

describe('htmlToPlainText', () => {
  it('strips all HTML tags', () => {
    const html = '<h2>Title</h2><p>Body with <a href="#">link</a></p>';
    expect(htmlToPlainText(html)).toBe('Title Body with link');
  });
});
