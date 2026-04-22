'use client';

import { ReactNode } from 'react';

export function DropdownMenu({
  open,
  onClose,
  children,
  align = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'right' | 'left';
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-[200] cursor-default"
      />
      <div
        role="menu"
        className={[
          'absolute top-[100px] z-[201] min-w-[200px] overflow-hidden rounded-xl border border-forest-border-soft bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]',
          align === 'right' ? 'right-[14px]' : 'left-[14px]',
          'fm-menu-in',
        ].join(' ')}
      >
        {children}
      </div>
    </>
  );
}

export function DropdownMenuDivider() {
  return <div className="h-px bg-forest-border-soft" />;
}

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  note,
  badge,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  note?: string;
  badge?: string;
}) {
  const textColor = disabled ? 'text-sage' : danger ? 'text-[#B3321F]' : 'text-forest-dark';
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-[10px] px-[14px] py-3 text-left font-body text-[14px] font-medium',
        textColor,
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-parchment',
      ].join(' ')}
    >
      {icon && <span className="flex h-[17px] w-[17px] items-center justify-center">{icon}</span>}
      <span className="flex-1">{children}</span>
      {badge && (
        <span className="rounded-[3px] bg-[#B3321F] px-[5px] py-[1.5px] text-[9px] font-bold uppercase tracking-[0.4px] text-white">
          {badge}
        </span>
      )}
      {note && <span className="text-[11px] font-normal text-sage">{note}</span>}
    </button>
  );
}
