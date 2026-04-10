import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../BlockConfigPanelV2', () => ({
  default: (props: any) => (
    <div data-testid="block-config-panel">
      {props.block.type === 'field_display' && <span>Field</span>}
      {props.block.type === 'divider' && <span>No configuration needed</span>}
    </div>
  ),
}));

import ConfigDrawer from '../ConfigDrawer';
import type { LayoutBlockV2 } from '@/lib/layout/types-v2';

describe('ConfigDrawer', () => {
  const onConfigChange = vi.fn();
  const onWidthChange = vi.fn();
  const onAlignChange = vi.fn();
  const onPermissionsChange = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const onCreateField = vi.fn();

  const fieldBlock: LayoutBlockV2 = {
    id: 'b1',
    type: 'field_display',
    config: { fieldId: 'f1', size: 'normal' as const, showLabel: true },
  };

  const dividerBlock: LayoutBlockV2 = {
    id: 'b2',
    type: 'divider',
    config: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when block is null', () => {
    const { container } = render(
      <ConfigDrawer block={null} customFields={[]} entityTypes={[]} onConfigChange={onConfigChange} onWidthChange={onWidthChange} onAlignChange={onAlignChange} onPermissionsChange={onPermissionsChange} onDelete={onDelete} onClose={onClose} onCreateField={onCreateField} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders config for field_display block', () => {
    render(
      <ConfigDrawer
        block={fieldBlock}
        customFields={[{ id: 'f1', name: 'Species', field_type: 'text' as const, item_type_id: 't1', options: null, required: false, sort_order: 0, org_id: 'o1' }]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onWidthChange={onWidthChange}
        onAlignChange={onAlignChange}
        onPermissionsChange={onPermissionsChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    expect(screen.getAllByText('Field').length).toBeGreaterThan(0);
  });

  it('shows no-config message for divider', () => {
    render(
      <ConfigDrawer block={dividerBlock} customFields={[]} entityTypes={[]} onConfigChange={onConfigChange} onWidthChange={onWidthChange} onAlignChange={onAlignChange} onPermissionsChange={onPermissionsChange} onDelete={onDelete} onClose={onClose} onCreateField={onCreateField} />
    );
    expect(screen.getByText(/no configuration/i)).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(
      <ConfigDrawer block={fieldBlock} customFields={[]} entityTypes={[]} onConfigChange={onConfigChange} onWidthChange={onWidthChange} onAlignChange={onAlignChange} onPermissionsChange={onPermissionsChange} onDelete={onDelete} onClose={onClose} onCreateField={onCreateField} />
    );
    fireEvent.click(screen.getByTestId('config-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onDelete with confirmation', () => {
    render(
      <ConfigDrawer block={fieldBlock} customFields={[]} entityTypes={[]} onConfigChange={onConfigChange} onWidthChange={onWidthChange} onAlignChange={onAlignChange} onPermissionsChange={onPermissionsChange} onDelete={onDelete} onClose={onClose} onCreateField={onCreateField} />
    );
    fireEvent.click(screen.getByText('Remove'));
    fireEvent.click(screen.getByText('Yes, Remove'));
    expect(onDelete).toHaveBeenCalledWith('b1');
  });
});
