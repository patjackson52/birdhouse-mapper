import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KnowledgePreviewCard } from '@/components/knowledge/KnowledgePreviewCard';

type TestItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  cover_image_url: string | null;
};

function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: 'k-1',
    slug: 'spring-cleaning',
    title: 'Spring Cleaning Protocol',
    excerpt: 'Step-by-step cleaning, inspection, and sanitizing procedure.',
    visibility: 'public',
    cover_image_url: null,
    ...overrides,
  };
}

describe('KnowledgePreviewCard', () => {
  it('renders the title and excerpt', () => {
    render(<KnowledgePreviewCard item={makeItem()} isOrgMember={false} />);
    expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument();
    expect(screen.getByText(/Step-by-step cleaning/)).toBeInTheDocument();
  });

  it('renders hero image when cover_image_url is present', () => {
    render(
      <KnowledgePreviewCard
        item={makeItem({ cover_image_url: 'https://example.com/hero.jpg' })}
        isOrgMember={false}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/hero.jpg');
    expect(img).toHaveAttribute('alt', 'Spring Cleaning Protocol');
  });

  it('omits hero image when cover_image_url is null', () => {
    render(<KnowledgePreviewCard item={makeItem()} isOrgMember={false} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders Public pill and public-route link for public articles', () => {
    render(<KnowledgePreviewCard item={makeItem({ visibility: 'public' })} isOrgMember={false} />);
    expect(screen.getByText(/Public/i)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/knowledge/spring-cleaning');
    expect(link.textContent).toMatch(/Read article/i);
  });

  it('renders Org pill and admin link for org articles when isOrgMember', () => {
    render(
      <KnowledgePreviewCard
        item={makeItem({ visibility: 'org', slug: 'inspection-checklist' })}
        isOrgMember={true}
      />,
    );
    expect(screen.getByText(/^Org$/)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/knowledge/inspection-checklist');
    expect(link.textContent).toMatch(/Read full article/i);
  });

  it('renders Org pill and sign-in link for org articles when anonymous', () => {
    render(
      <KnowledgePreviewCard
        item={makeItem({ visibility: 'org' })}
        isOrgMember={false}
        signInRedirect="/p/default/maintenance/abc"
      />,
    );
    expect(screen.getByText(/^Org$/)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      '/login?redirect=%2Fp%2Fdefault%2Fmaintenance%2Fabc',
    );
    expect(link.textContent).toMatch(/Sign in/i);
  });

  it('renders null excerpt gracefully', () => {
    render(<KnowledgePreviewCard item={makeItem({ excerpt: null })} isOrgMember={false} />);
    expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument();
  });
});
