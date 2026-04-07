// src/lib/editor/__tests__/RichTextEditor.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RichTextEditor from '../RichTextEditor';

// Mock vault actions to avoid Supabase calls
vi.mock('@/lib/vault/actions', () => ({
  uploadToVault: vi.fn(),
}));

// Mock VaultPicker
vi.mock('@/components/vault/VaultPicker', () => ({
  default: () => <div data-testid="vault-picker" />,
}));

describe('RichTextEditor', () => {
  it('renders the line height dropdown button', async () => {
    render(<RichTextEditor content={null} onChange={vi.fn()} orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('Line Spacing')).toBeTruthy();
    });
  });

  it('opens dropdown and shows line height options', async () => {
    render(<RichTextEditor content={null} onChange={vi.fn()} orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('Line Spacing')).toBeTruthy();
    });
    fireEvent.click(screen.getByTitle('Line Spacing'));
    expect(screen.getByText('1 — Compact')).toBeTruthy();
    expect(screen.getByText('1.15 — Normal')).toBeTruthy();
    expect(screen.getByText('1.5 — Relaxed')).toBeTruthy();
    expect(screen.getByText('2 — Double')).toBeTruthy();
  });
});
