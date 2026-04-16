import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageToolbar } from '../ImageBubbleMenu';
import { SNAP_POINTS } from '../resize-utils';

function mockEditor(overrides: {
  isActive?: (name: string) => boolean;
  getAttributes?: (name: string) => Record<string, any>;
  chain?: () => any;
}) {
  const chainFns = {
    focus: () => chainFns,
    updateAttributes: () => chainFns,
    wrapInImageGrid: () => chainFns,
    setGridColumns: () => chainFns,
    unwrapImageGrid: () => chainFns,
    run: () => true,
  };

  return {
    isActive: overrides.isActive ?? ((name: string) => name === 'vaultImage'),
    getAttributes: overrides.getAttributes ?? (() => ({ layout: 'default', caption: '', widthPercent: null })),
    chain: overrides.chain ?? (() => chainFns),
  } as any;
}

describe('ImageToolbar', () => {
  it('shows width picker buttons', () => {
    const editor = mockEditor({});
    render(<ImageToolbar editor={editor} />);
    for (const pt of SNAP_POINTS) {
      expect(screen.getByRole('button', { name: `${pt}%` })).toBeDefined();
    }
  });

  it('hides width picker when layout is full-width', () => {
    const editor = mockEditor({
      getAttributes: () => ({ layout: 'full-width', caption: '', widthPercent: null }),
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.queryByRole('button', { name: '50%' })).toBeNull();
  });

  it('shows "Create Grid" when not inside a grid', () => {
    const editor = mockEditor({
      isActive: (name: string) => name === 'vaultImage',
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.getByRole('button', { name: /Create Grid/i })).toBeDefined();
  });

  it('shows column picker and Unwrap when inside a grid', () => {
    const editor = mockEditor({
      isActive: (name: string) => name === 'vaultImage' || name === 'imageGrid',
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.getByRole('button', { name: '2' })).toBeDefined();
    expect(screen.getByRole('button', { name: '3' })).toBeDefined();
    expect(screen.getByRole('button', { name: '4' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Unwrap Grid/i })).toBeDefined();
  });
});
