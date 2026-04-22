import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteConfirmModal } from '../DeleteConfirmModal';

describe('DeleteConfirmModal', () => {
  const base = {
    open: true,
    onCancel: () => {},
    onConfirm: () => {},
    photoCount: 0,
    speciesCount: 0,
    permission: { kind: 'author' as const },
  };

  it('shows the admin badge when permission.kind is admin', () => {
    render(<DeleteConfirmModal {...base} permission={{ kind: 'admin' }} />);
    expect(screen.getByText(/DELETE OTHERS' UPDATE/)).toBeInTheDocument();
  });

  it('omits " along with:" when no collateral', () => {
    render(<DeleteConfirmModal {...base} />);
    const body = screen.getByText(/This cannot be reversed after 8 seconds/);
    expect(body.textContent).not.toContain('along with:');
  });

  it('includes " along with:" + photos bullet when photoCount > 0', () => {
    render(<DeleteConfirmModal {...base} photoCount={3} />);
    expect(screen.getByText(/along with:/)).toBeInTheDocument();
    expect(screen.getByText(/3/).closest('li')?.textContent).toMatch(/photos/);
  });

  it('shows species-count-propagation copy when speciesCount > 0', () => {
    render(<DeleteConfirmModal {...base} speciesCount={2} />);
    expect(
      screen.getByText(/counts update everywhere this species appears/i)
    ).toBeInTheDocument();
  });

  it('pluralizes photo/sighting correctly for count = 1', () => {
    render(<DeleteConfirmModal {...base} photoCount={1} speciesCount={1} />);
    expect(screen.getByText(/1 photo\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 species sighting\b/)).toBeInTheDocument();
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(<DeleteConfirmModal {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Delete permanently button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmModal {...base} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
