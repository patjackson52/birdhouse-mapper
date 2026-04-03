// src/components/knowledge/__tests__/KnowledgeRenderer.test.tsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KnowledgeRenderer from '../KnowledgeRenderer';
import type { KnowledgeItem } from '@/lib/knowledge/types';

const baseItem: KnowledgeItem = {
  id: 'k1',
  org_id: 'org-1',
  title: 'How to Clean Birdhouses',
  slug: 'how-to-clean-birdhouses-abc1',
  body: null,
  body_html: '<p>Step 1: Remove old nesting material.</p><p>Step 2: Scrub with mild soap.</p>',
  excerpt: 'Step-by-step guide',
  cover_image_url: 'https://example.com/cover.jpg',
  tags: ['maintenance', 'howto'],
  visibility: 'org',
  is_ai_context: true,
  ai_priority: null,
  created_by: 'user-1',
  updated_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('KnowledgeRenderer', () => {
  it('renders the title when showTitle is true', () => {
    render(<KnowledgeRenderer item={baseItem} showTitle />);
    expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
  });

  it('does not render the title when showTitle is false', () => {
    render(<KnowledgeRenderer item={baseItem} showTitle={false} />);
    expect(screen.queryByText('How to Clean Birdhouses')).toBeNull();
  });

  it('renders tags when showTags is true', () => {
    render(<KnowledgeRenderer item={baseItem} showTags />);
    expect(screen.getByText('maintenance')).toBeTruthy();
    expect(screen.getByText('howto')).toBeTruthy();
  });

  it('does not render tags when showTags is false', () => {
    render(<KnowledgeRenderer item={baseItem} showTags={false} />);
    expect(screen.queryByText('maintenance')).toBeNull();
  });

  it('renders the cover image', () => {
    const { container } = render(<KnowledgeRenderer item={baseItem} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('renders body_html content', () => {
    render(<KnowledgeRenderer item={baseItem} />);
    expect(screen.getByText('Step 1: Remove old nesting material.')).toBeTruthy();
    expect(screen.getByText('Step 2: Scrub with mild soap.')).toBeTruthy();
  });

  it('renders attachments when provided', () => {
    const attachments = [
      { vault_item_id: 'v1', file_name: 'guide.pdf', mime_type: 'application/pdf', file_size: 2048 },
      { vault_item_id: 'v2', file_name: 'photo.jpg', mime_type: 'image/jpeg', file_size: 512000 },
    ];
    render(<KnowledgeRenderer item={baseItem} showAttachments attachments={attachments} />);
    expect(screen.getByText('Attachments')).toBeTruthy();
    expect(screen.getByText('guide.pdf')).toBeTruthy();
    expect(screen.getByText('photo.jpg')).toBeTruthy();
  });

  it('does not render attachments section when empty', () => {
    render(<KnowledgeRenderer item={baseItem} showAttachments attachments={[]} />);
    expect(screen.queryByText('Attachments')).toBeNull();
  });

  it('does not render attachments when showAttachments is false', () => {
    const attachments = [{ vault_item_id: 'v1', file_name: 'guide.pdf', mime_type: 'application/pdf', file_size: 2048 }];
    render(<KnowledgeRenderer item={baseItem} showAttachments={false} attachments={attachments} />);
    expect(screen.queryByText('Attachments')).toBeNull();
  });

  it('handles item with no body_html', () => {
    const emptyItem = { ...baseItem, body_html: null };
    const { container } = render(<KnowledgeRenderer item={emptyItem} />);
    expect(container.querySelector('.prose')).toBeNull();
  });

  it('handles item with no cover image', () => {
    const noCoverItem = { ...baseItem, cover_image_url: null };
    const { container } = render(<KnowledgeRenderer item={noCoverItem} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies prose size class based on textSize', () => {
    const { container } = render(<KnowledgeRenderer item={baseItem} textSize="small" />);
    expect(container.querySelector('.prose-sm')).toBeTruthy();
  });
});
