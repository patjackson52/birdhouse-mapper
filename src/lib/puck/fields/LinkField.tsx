'use client';

import { useState, useEffect, useRef } from 'react';
import type { LinkValue } from './link-utils';
import { resolveLink } from './link-utils';
import { ColorPickerField } from './ColorPickerField';
import { PUBLIC_ROUTES, type LinkSuggestion } from './link-suggestions';
import { useLinkSuggestions } from './PuckSuggestionsProvider';

interface LinkFieldProps {
  value: string | LinkValue | undefined;
  onChange: (value: LinkValue) => void;
}

export function LinkField({ value, onChange }: LinkFieldProps) {
  const resolved = resolveLink(value);
  const [href, setHref] = useState(resolved.href);
  const [target, setTarget] = useState<'_blank' | undefined>(resolved.target);
  const [color, setColor] = useState<string | undefined>(resolved.color);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(`linkfield-listbox-${Math.random().toString(36).slice(2, 8)}`).current;

  const { externalLinks, pageLinks } = useLinkSuggestions();

  useEffect(() => {
    const r = resolveLink(value);
    setHref(r.href);
    setTarget(r.target);
    setColor(r.color);
  }, [value]);

  const filteredPages = PUBLIC_ROUTES.filter(
    (r) =>
      !href ||
      r.label.toLowerCase().includes(href.toLowerCase()) ||
      r.href.toLowerCase().includes(href.toLowerCase())
  );

  const filteredCustomPages = pageLinks.filter(
    (r) =>
      !href ||
      r.label.toLowerCase().includes(href.toLowerCase()) ||
      r.href.toLowerCase().includes(href.toLowerCase())
  );

  const filteredExternal = externalLinks.filter(
    (r) =>
      !href ||
      r.label.toLowerCase().includes(href.toLowerCase()) ||
      r.href.toLowerCase().includes(href.toLowerCase())
  );

  const allSuggestions: LinkSuggestion[] = [...filteredPages, ...filteredCustomPages, ...filteredExternal];

  function emitChange(updates: Partial<LinkValue>) {
    const next: LinkValue = {
      href: updates.href ?? href,
      target: updates.target !== undefined ? updates.target : target,
      color: updates.color !== undefined ? updates.color : color,
    };
    onChange(next);
  }

  function selectSuggestion(suggestion: LinkSuggestion) {
    const isExternal = suggestion.href.startsWith('http');
    const newTarget = isExternal ? '_blank' : target;
    setHref(suggestion.href);
    setTarget(newTarget);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange({
      href: suggestion.href,
      target: newTarget,
      color,
    });
  }

  function handleFocus() {
    setIsOpen(true);
    setActiveIndex(-1);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
    setActiveIndex(-1);
    emitChange({ href });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < allSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < allSuggestions.length) {
          selectSuggestion(allSuggestions[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
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

  const showCustomPages = filteredCustomPages.length > 0;
  const showExternal = filteredExternal.length > 0;
  const activeId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search pages or type URL..."
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {isOpen && allSuggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg"
          >
            {filteredPages.length > 0 && (
              <>
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                  Pages
                </li>
                {filteredPages.map((suggestion, i) => {
                  const globalIndex = i;
                  return (
                    <li
                      key={suggestion.href}
                      id={`${listboxId}-option-${globalIndex}`}
                      role="option"
                      aria-selected={activeIndex === globalIndex}
                      className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
                        activeIndex === globalIndex
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>{suggestion.label}</span>
                      <span className="text-[10px] text-gray-400">
                        {suggestion.href}
                      </span>
                    </li>
                  );
                })}
              </>
            )}

            {showCustomPages && (
              <>
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                  Custom Pages
                </li>
                {filteredCustomPages.map((suggestion, i) => {
                  const globalIndex = filteredPages.length + i;
                  return (
                    <li
                      key={suggestion.href}
                      id={`${listboxId}-option-${globalIndex}`}
                      role="option"
                      aria-selected={activeIndex === globalIndex}
                      className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
                        activeIndex === globalIndex
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>{suggestion.label}</span>
                      <span className="text-[10px] text-gray-400">
                        {suggestion.href}
                      </span>
                    </li>
                  );
                })}
              </>
            )}

            {showExternal && (
              <>
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                  Previously Used
                </li>
                {filteredExternal.map((suggestion, i) => {
                  const globalIndex = filteredPages.length + filteredCustomPages.length + i;
                  return (
                    <li
                      key={suggestion.href}
                      id={`${listboxId}-option-${globalIndex}`}
                      role="option"
                      aria-selected={activeIndex === globalIndex}
                      className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
                        activeIndex === globalIndex
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span><span aria-hidden="true">🔗 </span>{suggestion.label}</span>
                      <span className="max-w-[120px] truncate text-[10px] text-gray-400">
                        {suggestion.href}
                      </span>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        )}
      </div>

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
