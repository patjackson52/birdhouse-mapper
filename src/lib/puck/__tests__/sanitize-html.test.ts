import { describe, it, expect } from 'vitest';
import { sanitizeRichTextHtml } from '../sanitize-html';

const NBSP = ' ';

describe('sanitizeRichTextHtml', () => {
  it('passes allowlisted tags through', () => {
    expect(sanitizeRichTextHtml('<p>hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeRichTextHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(sanitizeRichTextHtml('<h2>title</h2>')).toBe('<h2>title</h2>');
  });

  it('strips disallowed tags but keeps text content', () => {
    expect(sanitizeRichTextHtml('<div>hi</div>')).toBe('hi');
    expect(sanitizeRichTextHtml('<span>x</span>')).toBe('x');
    expect(sanitizeRichTextHtml('<h1>x</h1>')).toBe('x');
    expect(sanitizeRichTextHtml('<h5>x</h5>')).toBe('x');
    expect(sanitizeRichTextHtml('<table><tr><td>x</td></tr></table>')).toBe('x');
  });

  it('strips script tags and event handlers', () => {
    const result = sanitizeRichTextHtml('<p onclick="alert(1)">x</p><script>alert(1)</script>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('script');
    expect(result).toContain('x');
  });

  it('strips class, style, id, xmlns, data-* attributes', () => {
    const input = '<p class="x" style="color:red" id="y" xmlns="ns" data-foo="bar">hi</p>';
    expect(sanitizeRichTextHtml(input)).toBe('<p>hi</p>');
  });

  it('removes javascript: and data: URLs from href', () => {
    expect(sanitizeRichTextHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizeRichTextHtml('<a href="data:text/html,foo">x</a>')).not.toContain('data:');
  });

  it('preserves http/https/mailto/relative href', () => {
    expect(sanitizeRichTextHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
    expect(sanitizeRichTextHtml('<a href="/path">x</a>')).toContain('href="/path"');
    expect(sanitizeRichTextHtml('<a href="mailto:a@b.com">x</a>')).toContain('href="mailto:a@b.com"');
  });

  it('auto-adds rel="noopener noreferrer" when target=_blank', () => {
    const result = sanitizeRichTextHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('strips img event handlers but keeps allowlisted attrs', () => {
    const result = sanitizeRichTextHtml('<img src="/x.jpg" alt="x" onerror="alert(1)" width="10">');
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="/x.jpg"');
    expect(result).toContain('alt="x"');
    expect(result).toContain('width="10"');
  });

  it('collapses runs of 2+ NBSP/spaces to single ASCII space', () => {
    expect(sanitizeRichTextHtml(`<p>a${NBSP}${NBSP}b</p>`)).toBe('<p>a b</p>');
    expect(sanitizeRichTextHtml(`<p>a  b</p>`)).toBe('<p>a b</p>');
    expect(sanitizeRichTextHtml(`<p>a${NBSP} ${NBSP}b</p>`)).toBe('<p>a b</p>');
  });

  it('preserves isolated NBSP', () => {
    expect(sanitizeRichTextHtml(`<p>10${NBSP}km</p>`)).toBe(`<p>10${NBSP}km</p>`);
    expect(sanitizeRichTextHtml(`<p>Mr.${NBSP}Smith</p>`)).toBe(`<p>Mr.${NBSP}Smith</p>`);
  });

  it('removes Quill paste artifacts (wrapper divs + xmlns) and preserves single NBSPs', () => {
    const quillSample = `<div class="_RichTextEditor_z25h4_1"><div class="rich-text"><p xmlns="http://www.w3.org/1999/xhtml">Eagle${NBSP}Scout${NBSP}Fairbanks</p></div></div>`;
    const result = sanitizeRichTextHtml(quillSample);
    expect(result).not.toContain('_RichTextEditor');
    expect(result).not.toContain('rich-text');
    expect(result).not.toContain('xmlns');
    expect(result).toContain(`Eagle${NBSP}Scout${NBSP}Fairbanks`);
    expect(result.startsWith('<p>')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeRichTextHtml('')).toBe('');
  });

  it('returns literal U+00A0 (not entity) in output', () => {
    const result = sanitizeRichTextHtml(`<p>10${NBSP}km</p>`);
    expect(result).toContain(NBSP);           // literal NBSP present
    expect(result).not.toContain('&nbsp;');   // no entity reference
  });

  it('is idempotent — sanitize(sanitize(x)) === sanitize(x)', () => {
    const inputs = [
      '<p>hi</p>',
      `<p>a${NBSP}${NBSP}b</p>`,
      '<a href="https://example.com" target="_blank">x</a>',
      '<div>x<script>y</script></div>',
      '',
    ];
    for (const input of inputs) {
      const once = sanitizeRichTextHtml(input);
      expect(sanitizeRichTextHtml(once)).toBe(once);
    }
  });
});
