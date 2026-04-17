import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntityCard from '@/components/admin/EntityCard';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: 'https://supabase/x.jpg' } }),
      }),
    },
  }),
}));

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: () => <span data-testid="icon-fallback" />,
}));

const entityType = {
  id: 'et-1',
  org_id: 'o',
  name: 'Species',
  icon: { set: 'emoji', name: '🦅' },
  color: '#000',
  link_to: ['items'],
  api_source: null,
  sort_order: 0,
  created_at: '',
  updated_at: '',
};

describe('EntityCard photo fallback', () => {
  it('uses photo_path via Supabase when set', () => {
    const entity = {
      id: '1',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'X',
      description: null,
      photo_path: 'path/one.jpg',
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://supabase/x.jpg'
    );
  });

  it('falls back to custom_field_values.photo_url when photo_path is null', () => {
    const entity = {
      id: '2',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'Bluebird',
      description: null,
      photo_path: null,
      external_link: null,
      external_id: '7086',
      custom_field_values: { photo_url: 'https://inat/b.jpg' },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://inat/b.jpg'
    );
  });

  it('renders icon when neither photo_path nor custom_field_values.photo_url present', () => {
    const entity = {
      id: '3',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'X',
      description: null,
      photo_path: null,
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId('icon-fallback')).toBeInTheDocument();
  });
});
