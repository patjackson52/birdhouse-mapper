import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropdownMenu, DropdownMenuItem } from '../DropdownMenu';

describe('DropdownMenu', () => {
  it('renders children when open', () => {
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}}>Share</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <DropdownMenu open={false} onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}}>Share</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(container.textContent).not.toContain('Share');
  });

  it('disabled item shows note and is not clickable', () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={onSelect} disabled note="Only author or admin">
          Delete
        </DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('Only author or admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('danger variant with ADMIN badge renders the badge', () => {
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}} danger badge="ADMIN">
          Delete (admin)
        </DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });
});
