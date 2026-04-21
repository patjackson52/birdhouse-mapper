import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RailCard } from '../RailCard';
import type { EnrichedUpdate } from '@/lib/types';

function makeUpdate(overrides: Partial<EnrichedUpdate> = {}): EnrichedUpdate {
  return {
    id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'Saw a bluebird',
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Nest check', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [],
    species: [],
    fields: [],
    createdByProfile: { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 3 },
    ...overrides,
  };
}

describe('RailCard', () => {
  it('renders type name and content', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast={false} />);
    expect(screen.getByText('Nest check')).toBeInTheDocument();
    expect(screen.getByText('Saw a bluebird')).toBeInTheDocument();
  });

  it('uses icon fallback when no photo', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast={false} />);
    expect(screen.getByText('🐣')).toBeInTheDocument();
  });

  it('uses photo when present', () => {
    const update = makeUpdate({ photos: [{ id: 'ph1', update_id: 'u1', storage_path: 'p.png', url: 'p.png' } as any] });
    render(<RailCard update={update} onOpen={() => {}} isLast={false} />);
    expect(screen.queryByText('🐣')).toBeNull();
    expect(document.querySelector('img[src="p.png"]')).toBeInTheDocument();
  });

  it('caps species avatar stack at 3', () => {
    const update = makeUpdate({
      species: [
        { external_id: 1, entity_id: 'e1', common_name: 'A', photo_url: 'a.png', native: true, cavity_nester: false },
        { external_id: 2, entity_id: 'e2', common_name: 'B', photo_url: 'b.png', native: true, cavity_nester: false },
        { external_id: 3, entity_id: 'e3', common_name: 'C', photo_url: 'c.png', native: true, cavity_nester: false },
        { external_id: 4, entity_id: 'e4', common_name: 'D', photo_url: 'd.png', native: true, cavity_nester: false },
      ],
    });
    render(<RailCard update={update} onOpen={() => {}} isLast={false} />);
    const avatars = Array.from(document.querySelectorAll('img[alt="A"], img[alt="B"], img[alt="C"], img[alt="D"]'));
    expect(avatars).toHaveLength(3);
  });

  it('onOpen fires on click', () => {
    const onOpen = vi.fn();
    render(<RailCard update={makeUpdate()} onOpen={onOpen} isLast={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('hides the rail line when isLast', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast />);
    expect(document.querySelector('[data-testid="rail-line"]')).toBeNull();
  });
});
