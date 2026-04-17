import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntityTypeForm from '@/components/admin/EntityTypeForm';

const insertSingle = vi.fn().mockResolvedValue({
  data: {
    id: 'et-new',
    org_id: 'org-1',
    name: 'Species',
    icon: { set: 'emoji', name: '🦅' },
    color: '#5D7F3A',
    link_to: ['items', 'updates'],
    api_source: 'inaturalist',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  error: null,
});
const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
const insert = vi.fn().mockReturnValue({ select: insertSelect });
const from = vi.fn().mockReturnValue({ insert });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from }),
}));

vi.mock('@/components/shared/IconPicker', () => ({
  IconPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ set: 'emoji', name: '🦅' })}>
      pick
    </button>
  ),
  IconRenderer: () => null,
}));

vi.mock('@/components/shared/fields', () => ({
  FieldDefinitionEditor: () => <div data-testid="field-editor" />,
}));

describe('EntityTypeForm api_source field', () => {
  it('renders an API Source dropdown and submits the selected value', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <EntityTypeForm orgId="org-1" onSaved={onSaved} onCancel={vi.fn()} />
    );

    const nameInput = screen.getByPlaceholderText(/e\.g\., Species/i);
    await user.type(nameInput, 'Species');

    const apiSource = screen.getByLabelText(/api source/i) as HTMLSelectElement;
    await user.selectOptions(apiSource, 'inaturalist');

    await user.click(
      screen.getByRole('button', { name: /create entity type/i })
    );

    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0]).toMatchObject({
      name: 'Species',
      api_source: 'inaturalist',
    });
  });
});
