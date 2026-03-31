import { describe, it, expect } from 'vitest';
import { resolveLink, type LinkValue } from '../link-utils';

describe('resolveLink', () => {
  it('resolves a plain string to LinkValue with defaults', () => {
    const result = resolveLink('https://example.com');
    expect(result).toEqual({ href: 'https://example.com', target: '_blank', color: undefined });
  });

  it('resolves a plain internal path string', () => {
    const result = resolveLink('/about');
    expect(result).toEqual({ href: '/about', target: undefined, color: undefined });
  });

  it('passes through a LinkValue object', () => {
    const input: LinkValue = { href: '/contact', target: '_blank', color: '#ff0000' };
    const result = resolveLink(input);
    expect(result).toEqual(input);
  });

  it('resolves empty string', () => {
    const result = resolveLink('');
    expect(result).toEqual({ href: '', target: undefined, color: undefined });
  });

  it('resolves undefined to empty href', () => {
    const result = resolveLink(undefined);
    expect(result).toEqual({ href: '', target: undefined, color: undefined });
  });

  it('resolves a LinkValue without optional fields', () => {
    const result = resolveLink({ href: 'https://example.com' });
    expect(result).toEqual({ href: 'https://example.com', target: undefined, color: undefined });
  });
});
