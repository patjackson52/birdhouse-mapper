import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import VaultTable from '../VaultTable';
import type { VaultItem } from '@/lib/vault/types';

vi.mock('@/lib/vault/helpers', () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} B`),
}));

function makeItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    org_id: 'org-1',
    uploaded_by: 'user-1',
    storage_bucket: 'vault-public',
    storage_path: 'org-1/item-1/photo.jpg',
    file_name: 'photo.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    category: 'photo',
    visibility: 'public',
    is_ai_context: false,
    ai_priority: null,
    metadata: {},
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    moderation_status: 'approved',
    moderation_scores: null,
    rejection_reason: null,
    moderated_at: null,
    ...overrides,
  };
}

describe('VaultTable', () => {
  it('renders empty state', () => {
    render(
      <VaultTable items={[]} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('No files in the vault yet.')).toBeTruthy();
  });

  it('renders items with correct data', () => {
    const items = [
      makeItem({ id: 'item-1', file_name: 'photo.jpg' }),
      makeItem({ id: 'item-2', file_name: 'document.pdf', category: 'document', mime_type: 'application/pdf' }),
    ];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('photo.jpg')).toBeTruthy();
    expect(screen.getByText('document.pdf')).toBeTruthy();
  });

  it('calls onItemClick when row is clicked', () => {
    const onItemClick = vi.fn();
    const item = makeItem();
    render(
      <VaultTable items={[item]} onItemClick={onItemClick} onDelete={vi.fn()} />
    );
    fireEvent.click(screen.getByText('photo.jpg'));
    expect(onItemClick).toHaveBeenCalledOnce();
    expect(onItemClick).toHaveBeenCalledWith(item);
  });

  it('checkbox selection works', () => {
    const items = [makeItem()];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    // Click the td cell that wraps the checkbox (it calls toggleOne via onClick with stopPropagation)
    const checkbox = screen.getByLabelText('Select photo.jpg');
    act(() => {
      fireEvent.click(checkbox.closest('td')!);
    });
    expect(screen.getByText('1 item selected')).toBeTruthy();
  });

  it('select all checkbox works', () => {
    const items = [
      makeItem({ id: 'item-1', file_name: 'photo.jpg' }),
      makeItem({ id: 'item-2', file_name: 'other.jpg' }),
    ];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    const selectAll = screen.getByLabelText('Select all');
    act(() => {
      fireEvent.click(selectAll);
    });
    expect(screen.getByText('2 items selected')).toBeTruthy();
  });

  it('sort by file name', () => {
    const items = [
      makeItem({ id: 'item-1', file_name: 'beta.jpg' }),
      makeItem({ id: 'item-2', file_name: 'alpha.jpg' }),
    ];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /File/ }));
    const filenames = screen.getAllByText(/\.jpg/);
    // After sorting ascending, alpha.jpg should appear before beta.jpg
    const allText = screen.getAllByTitle(/\.jpg/);
    expect(allText[0].getAttribute('title')).toBe('alpha.jpg');
    expect(allText[1].getAttribute('title')).toBe('beta.jpg');
  });

  it('shows visibility badges', () => {
    const items = [
      makeItem({ id: 'item-1', file_name: 'public.jpg', visibility: 'public' }),
      makeItem({ id: 'item-2', file_name: 'private.jpg', visibility: 'private' }),
    ];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('Public')).toBeTruthy();
    expect(screen.getByText('Private')).toBeTruthy();
  });

  it('shows AI context indicator', () => {
    const item = makeItem({ is_ai_context: true });
    render(
      <VaultTable items={[item]} onItemClick={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByTitle('AI context')).toBeTruthy();
    expect(screen.getByTitle('AI context').textContent).toBe('⭐');
  });

  it('hides checkboxes when selectable=false', () => {
    const items = [makeItem()];
    render(
      <VaultTable items={items} onItemClick={vi.fn()} onDelete={vi.fn()} selectable={false} />
    );
    expect(screen.queryByLabelText('Select all')).toBeNull();
    expect(screen.queryByLabelText('Select photo.jpg')).toBeNull();
  });
});
