import '@testing-library/jest-dom/vitest';

// @puckeditor/core → @dnd-kit/dom requires ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
