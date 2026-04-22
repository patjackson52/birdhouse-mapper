import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnrichedUpdate } from '@/lib/types';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/p/farm/item/abc',
}));

import { UpdateDetailSheet } from '../UpdateDetailSheet';

function make(overrides: Partial<EnrichedUpdate> = {}): EnrichedUpdate {
  return {
    id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'Bluebird fledged!',
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Nest check', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [],
    species: [],
    fields: [],
    createdByProfile: { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 7 },
    ...overrides,
  };
}

describe('UpdateDetailSheet', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('renders nothing when update is null', () => {
    const { container } = render(
      <UpdateDetailSheet
        update={null}
        onClose={() => {}}
        onRequestDelete={() => {}}
        deletePermission={null}
        currentUserId={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders content and attribution', () => {
    render(
      <UpdateDetailSheet
        update={make()}
        onClose={() => {}}
        onRequestDelete={() => {}}
        deletePermission={null}
        currentUserId="user-a"
      />
    );
    expect(screen.getByText('Bluebird fledged!')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(
      <UpdateDetailSheet
        update={make()}
        onClose={onClose}
        onRequestDelete={() => {}}
        deletePermission={null}
        currentUserId="user-a"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('species row click pushes to /species/:id?from=<pathname>', () => {
    const update = make({
      species: [{ external_id: 14886, entity_id: 'e1', common_name: 'Eastern Bluebird', photo_url: 'b.png', native: true, cavity_nester: true }],
    });
    render(
      <UpdateDetailSheet
        update={update}
        onClose={() => {}}
        onRequestDelete={() => {}}
        deletePermission={null}
        currentUserId="user-a"
      />
    );
    // The species row may render the common_name twice (once as common, once as scientific which is a known gap).
    const targets = screen.getAllByText('Eastern Bluebird');
    fireEvent.click(targets[0]);
    expect(pushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/species\/14886\?from=/));
    // Confirm the pathname is encoded in the URL.
    expect(pushMock.mock.calls[0][0]).toContain(encodeURIComponent('/p/farm/item/abc'));
  });
});

describe('UpdateDetailSheet delete flow', () => {
  const base = {
    update: {
      id: 'u-1',
      item_id: 'i-1',
      property_id: 'p-1',
      org_id: 'o-1',
      update_type_id: 'ut-1',
      content: 'x',
      update_date: '2026-04-10',
      created_at: '2026-04-10T00:00:00Z',
      created_by: 'user-1',
      anon_name: null,
      custom_field_values: {},
      photos: [],
      species: [],
      fields: [],
      update_type: { id: 'ut-1', name: 'Observation', icon: '📝' },
    } as any,
    onClose: () => {},
    onRequestDelete: () => {},
    currentUserId: 'user-1',
  };

  it('disabled delete item renders "Only author or admin" when deletePermission is null', () => {
    render(<UpdateDetailSheet {...base} deletePermission={null} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/Only author or admin/)).toBeInTheDocument();
  });

  it('admin permission shows "Delete (admin)" with ADMIN badge', () => {
    render(<UpdateDetailSheet {...base} deletePermission={{ kind: 'admin' }} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText('Delete (admin)')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('clicking Delete then Delete permanently calls onRequestDelete', () => {
    const onRequestDelete = vi.fn();
    render(<UpdateDetailSheet {...base} deletePermission={{ kind: 'author' }} onRequestDelete={onRequestDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/ }));
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onRequestDelete).toHaveBeenCalledWith(base.update, { kind: 'author' });
  });
});
