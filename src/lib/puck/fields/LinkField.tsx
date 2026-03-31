'use client';

import { useState, useEffect } from 'react';
import type { LinkValue } from './link-utils';
import { resolveLink } from './link-utils';
import { ColorPickerField } from './ColorPickerField';

interface LinkFieldProps {
  value: string | LinkValue | undefined;
  onChange: (value: LinkValue) => void;
}

export function LinkField({ value, onChange }: LinkFieldProps) {
  const resolved = resolveLink(value);
  const [href, setHref] = useState(resolved.href);
  const [target, setTarget] = useState<'_blank' | undefined>(resolved.target);
  const [color, setColor] = useState<string | undefined>(resolved.color);

  useEffect(() => {
    const r = resolveLink(value);
    setHref(r.href);
    setTarget(r.target);
    setColor(r.color);
  }, [value]);

  function emitChange(updates: Partial<LinkValue>) {
    const next: LinkValue = {
      href: updates.href ?? href,
      target: updates.target !== undefined ? updates.target : target,
      color: updates.color !== undefined ? updates.color : color,
    };
    onChange(next);
  }

  function handleHrefBlur() {
    emitChange({ href });
  }

  function handleTargetToggle() {
    const next = target === '_blank' ? undefined : '_blank';
    setTarget(next);
    emitChange({ target: next });
  }

  function handleColorChange(c: string | undefined) {
    setColor(c);
    emitChange({ color: c });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onBlur={handleHrefBlur}
        placeholder="URL (e.g. /about or https://...)"
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={target === '_blank'}
            onChange={handleTargetToggle}
            className="rounded border-gray-300"
            aria-label="Open in new tab"
          />
          New tab
        </label>
      </div>

      <ColorPickerField
        value={color}
        onChange={handleColorChange}
        label="Link Color"
      />
    </div>
  );
}
