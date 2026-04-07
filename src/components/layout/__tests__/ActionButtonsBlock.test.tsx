import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionButtonsBlock from '../blocks/ActionButtonsBlock';

describe('ActionButtonsBlock', () => {
  it('hides Edit button when canEdit is false', () => {
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

  it('links Add Update to /manage/update when authenticated', () => {
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

  it('links Add Update to /login with redirect when not authenticated', () => {
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
      '/login?redirect=%2Fmanage%2Fupdate%3Fitem%3Ditem-1'
    );
  });

  it('renders disabled buttons in preview mode regardless of permissions', () => {
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
