// src/lib/editor/__tests__/PasteFormatDialog.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasteFormatDialog } from '../PasteFormatDialog';

describe('PasteFormatDialog', () => {
  it('renders the dialog with Keep and Plain text buttons', () => {
    render(<PasteFormatDialog onKeep={vi.fn()} onPlainText={vi.fn()} />);
    expect(screen.getByText('Pasted content contains formatting.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plain text' })).toBeTruthy();
  });

  it('calls onKeep when Keep is clicked', () => {
    const onKeep = vi.fn();
    render(<PasteFormatDialog onKeep={onKeep} onPlainText={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it('calls onPlainText when Plain text is clicked', () => {
    const onPlainText = vi.fn();
    render(<PasteFormatDialog onKeep={vi.fn()} onPlainText={onPlainText} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plain text' }));
    expect(onPlainText).toHaveBeenCalledOnce();
  });
});
