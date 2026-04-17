import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionButtonsBlock from '../blocks/ActionButtonsBlock';

let mockParams: Record<string, string> = { slug: 'oak-meadow' };
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

describe('ActionButtonsBlock', () => {
  it('hides Edit button when canEdit is false', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );

    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.getByText('Add Update')).toBeDefined();
  });

  it('shows Edit button when canEdit is true', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={true}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );

    expect(screen.getByText('Edit')).toBeDefined();
  });

  it('links Add Update to /p/[slug]/update/[itemId] when authenticated and slug is present', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe('/p/oak-meadow/update/item-1');
  });

  it('falls back to /manage/update?item=[itemId] when slug is missing', () => {
    mockParams = {};
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe('/manage/update?item=item-1');
  });

  it('links Add Update to /login with redirect (using new path) when not authenticated', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={false}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe(
      '/login?redirect=%2Fp%2Foak-meadow%2Fupdate%2Fitem-1'
    );
  });

  it('renders disabled buttons in preview mode regardless of permissions', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={true}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="preview"
      />
    );

    const editBtn = screen.getByText('Edit');
    expect(editBtn.tagName).toBe('BUTTON');
    expect(editBtn.hasAttribute('disabled')).toBe(true);

    const addUpdateBtn = screen.getByText('Add Update');
    expect(addUpdateBtn.tagName).toBe('BUTTON');
    expect(addUpdateBtn.hasAttribute('disabled')).toBe(true);
  });

  it('hides both buttons when both are false', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={false}
        isAuthenticated={false}
        mode="live"
      />
    );

    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Add Update')).toBeNull();
  });
});
