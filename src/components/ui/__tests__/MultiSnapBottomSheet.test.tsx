import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiSnapBottomSheet from '../MultiSnapBottomSheet';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onStateChange: vi.fn(),
};

describe('MultiSnapBottomSheet', () => {
  it('renders children when open', () => {
    render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Sheet content</p>
      </MultiSnapBottomSheet>
    );
    expect(screen.getByText('Sheet content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <MultiSnapBottomSheet {...defaultProps} isOpen={false}>
        <p>Sheet content</p>
      </MultiSnapBottomSheet>
    );
    expect(screen.queryByText('Sheet content')).not.toBeInTheDocument();
  });

  it('renders a handle button with aria-label matching /expand/i', () => {
    render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );
    const handle = screen.getByRole('button', { name: /expand/i });
    expect(handle).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <MultiSnapBottomSheet {...defaultProps} onClose={onClose}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );
    const overlay = screen.getByTestId('sheet-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
