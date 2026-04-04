import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MultiSnapBottomSheet from '../MultiSnapBottomSheet';

// Capture ResizeObserver callbacks so we can trigger them in tests
let resizeCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeCallback = null;
  }
}

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, style, animate, initial, exit, transition, ...props }: any) => (
      <div
        {...props}
        style={{
          ...style,
          ...(animate && typeof animate === 'object' ? animate : {}),
        }}
      >
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
}));

function triggerResize(height: number) {
  if (resizeCallback) {
    resizeCallback(
      [{ contentRect: { height } } as ResizeObserverEntry],
      {} as ResizeObserver
    );
  }
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onStateChange: vi.fn(),
};

describe('MultiSnapBottomSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('innerHeight', 800);
    defaultProps.onClose = vi.fn();
    defaultProps.onStateChange = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resizeCallback = null;
  });

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

  it('emits full state when opened', () => {
    const onStateChange = vi.fn();
    render(
      <MultiSnapBottomSheet {...defaultProps} onStateChange={onStateChange}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );
    expect(onStateChange).toHaveBeenCalledWith('full');
  });

  it('sizes sheet to content height when content fits viewport', () => {
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );

    act(() => triggerResize(200));

    // Sheet height = contentHeight (200) + HANDLE_HEIGHT (48) = 248
    const sheet = container.querySelector('.fixed.bottom-0') as HTMLElement;
    expect(sheet.style.height).toBe('248px');
  });

  it('caps sheet height at 92% of viewport and enables scrolling', () => {
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Lots of content</p>
      </MultiSnapBottomSheet>
    );

    // Content taller than viewport * 0.92 - handle overhead
    act(() => triggerResize(900));

    const sheet = container.querySelector('.fixed.bottom-0') as HTMLElement;
    // maxHeight = 800 * 0.92 = 736
    expect(sheet.style.height).toBe('736px');

    // Scroll container should have overflow-y: auto
    const scrollContainer = sheet.querySelector('[style*="overflow-y"]') as HTMLElement;
    expect(scrollContainer.style.overflowY).toBe('auto');
  });

  it('disables scrolling when content fits', () => {
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Short content</p>
      </MultiSnapBottomSheet>
    );

    act(() => triggerResize(100));

    const sheet = container.querySelector('.fixed.bottom-0') as HTMLElement;
    const scrollContainer = sheet.querySelector('[style*="overflow-y"]') as HTMLElement;
    expect(scrollContainer.style.overflowY).toBe('hidden');
  });

  it('dismisses on swipe down when scrolled to top', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps} onClose={onClose}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );

    const sheet = container.querySelector('.fixed.bottom-0') as HTMLElement;

    fireEvent.touchStart(sheet, {
      touches: [{ clientY: 100 }],
    });
    fireEvent.touchEnd(sheet, {
      changedTouches: [{ clientY: 250 }],
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not dismiss on upward swipe', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps} onClose={onClose}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );

    const sheet = container.querySelector('.fixed.bottom-0') as HTMLElement;

    fireEvent.touchStart(sheet, {
      touches: [{ clientY: 300 }],
    });
    fireEvent.touchEnd(sheet, {
      changedTouches: [{ clientY: 100 }],
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows gradient fade only when scrolling is enabled', () => {
    const { container } = render(
      <MultiSnapBottomSheet {...defaultProps}>
        <p>Content</p>
      </MultiSnapBottomSheet>
    );

    // Short content — no gradient
    act(() => triggerResize(100));
    expect(container.querySelector('.bg-gradient-to-t')).not.toBeInTheDocument();

    // Tall content — gradient appears
    act(() => triggerResize(900));
    expect(container.querySelector('.bg-gradient-to-t')).toBeInTheDocument();
  });
});
