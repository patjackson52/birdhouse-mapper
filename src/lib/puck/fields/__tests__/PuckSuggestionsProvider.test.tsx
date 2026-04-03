import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PuckSuggestionsProvider, useLinkSuggestions } from '../PuckSuggestionsProvider';

function Consumer() {
  const { externalLinks } = useLinkSuggestions();
  return (
    <ul>
      {externalLinks.map((link) => (
        <li key={link.href}>{link.label}</li>
      ))}
    </ul>
  );
}

describe('PuckSuggestionsProvider', () => {
  it('provides empty external links initially', () => {
    const data = { root: { props: {} }, content: [] };
    render(
      <PuckSuggestionsProvider data={data}>
        <Consumer />
      </PuckSuggestionsProvider>
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('extracts external links from data', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'h1', ctaHref: { href: 'https://example.com' } },
        },
      ],
    };
    render(
      <PuckSuggestionsProvider data={data}>
        <Consumer />
      </PuckSuggestionsProvider>
    );
    expect(screen.getByText('example.com')).toBeDefined();
  });

  it('useLinkSuggestions returns empty when used outside provider', () => {
    render(<Consumer />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
