import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceDetailForm } from '@/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm';
import type { MaintenanceProject } from '@/lib/maintenance/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

const updateSpy = vi.fn(async (_id: string, _input: Record<string, unknown>) => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  updateMaintenanceProject: (id: string, input: Record<string, unknown>) => updateSpy(id, input),
  deleteMaintenanceProject: vi.fn(),
  removeItemFromProject: vi.fn(),
  setItemCompletion: vi.fn(),
  removeKnowledgeFromProject: vi.fn(),
}));

function makeProject(overrides: Partial<MaintenanceProject> = {}): MaintenanceProject {
  return {
    id: 'p-1',
    org_id: 'o1',
    property_id: 'prop1',
    title: 'Spring cleanout',
    description: null,
    status: 'planned',
    scheduled_for: '2026-05-15',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

describe('MaintenanceDetailForm', () => {
  beforeEach(() => updateSpy.mockClear());

  it('Save button is disabled when form is unchanged', () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('Save button enables when a field changes', () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'New title' } });
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled();
  });

  it('rejects empty title', async () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('calls updateMaintenanceProject on save', async () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0][1]).toMatchObject({ title: 'Updated' });
  });
});
