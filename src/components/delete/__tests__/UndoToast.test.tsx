import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UndoToast } from '../UndoToast';

describe('UndoToast', () => {
  it('returns null when no pending', () => {
    const { container } = render(<UndoToast pending={null} onUndo={() => {}} onExpire={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('shows "Permanent in Ns" with rounded-up seconds', () => {
    const expiresAtMs = Date.now() + 5500;
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs }}
        onUndo={() => {}}
        onExpire={() => {}}
      />
    );
    expect(screen.getByText(/Permanent in 6s/)).toBeInTheDocument();
  });

  it('calls onUndo when the Undo button is clicked', () => {
    const onUndo = vi.fn();
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 8000 }}
        onUndo={onUndo}
        onExpire={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('fires onExpire after the deadline passes', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 200 }}
        onUndo={() => {}}
        onExpire={onExpire}
      />
    );
    act(() => { vi.advanceTimersByTime(400); });
    expect(onExpire).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
