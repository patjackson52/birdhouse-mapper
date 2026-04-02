'use client';

import { useState } from 'react';
import type { VaultItem, VaultCategory } from '@/lib/vault/types';

type SortColumn = 'file_name' | 'file_size' | 'created_at';
type SortDirection = 'asc' | 'desc';

const CATEGORY_ICONS: Record<VaultCategory, string> = {
  photo: '🖼️',
  document: '📄',
  branding: '🎨',
  geospatial: '🗺️',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface VaultTableProps {
  items: VaultItem[];
  onItemClick: (item: VaultItem) => void;
  onDelete: (ids: string[]) => void;
  selectable?: boolean;
  bulkActionLabel?: string;
  bulkActionConfirm?: (count: number) => string;
}

export default function VaultTable({
  items,
  onItemClick,
  onDelete,
  selectable = true,
  bulkActionLabel = 'Delete',
  bulkActionConfirm,
}: VaultTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  function handleSortClick(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  const sorted = [...items].sort((a, b) => {
    let cmp = 0;
    if (sortColumn === 'file_name') {
      cmp = a.file_name.localeCompare(b.file_name);
    } else if (sortColumn === 'file_size') {
      cmp = a.file_size - b.file_size;
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const allSelected = sorted.length > 0 && sorted.every((item) => selectedIds.has(item.id));
  const someSelected = sorted.some((item) => selectedIds.has(item.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((item) => item.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleBulkDelete() {
    const count = selectedIds.size;
    const message = bulkActionConfirm
      ? bulkActionConfirm(count)
      : `Delete ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`;
    if (!confirm(message)) return;
    onDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function SortIndicator({ column }: { column: SortColumn }) {
    if (sortColumn !== column) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-forest-dark ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className="card overflow-hidden">
      {selectable && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-sage-light border-b border-gray-200">
          <span className="text-sm font-medium text-forest-dark">
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 text-sm rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
          >
            {bulkActionLabel}
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-1 text-sm rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {selectable && (
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="rounded border-gray-300 cursor-pointer"
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" aria-label="Category" />
            <th className="text-left px-4 py-3 font-medium text-gray-600">
              <button
                type="button"
                onClick={() => handleSortClick('file_name')}
                className="flex items-center hover:text-forest-dark transition-colors"
              >
                File
                <SortIndicator column="file_name" />
              </button>
            </th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">
              <button
                type="button"
                onClick={() => handleSortClick('file_size')}
                className="flex items-center hover:text-forest-dark transition-colors"
              >
                Size
                <SortIndicator column="file_size" />
              </button>
            </th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Visibility</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">AI</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">
              <button
                type="button"
                onClick={() => handleSortClick('created_at')}
                className="flex items-center hover:text-forest-dark transition-colors"
              >
                Added
                <SortIndicator column="created_at" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={selectable ? 8 : 7}
                className="px-4 py-10 text-center text-sage text-sm"
              >
                No files in the vault yet.
              </td>
            </tr>
          )}
          {sorted.map((item) => (
            <tr
              key={item.id}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => onItemClick(item)}
            >
              {selectable && (
                <td
                  className="px-4 py-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOne(item.id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="rounded border-gray-300 cursor-pointer"
                    aria-label={`Select ${item.file_name}`}
                  />
                </td>
              )}
              <td className="px-4 py-3 text-base leading-none" aria-label={item.category}>
                {CATEGORY_ICONS[item.category]}
              </td>
              <td className="px-4 py-3">
                <span className="font-medium text-forest-dark truncate max-w-xs block" title={item.file_name}>
                  {item.file_name}
                </span>
              </td>
              <td className="px-4 py-3 text-sage capitalize">{item.category}</td>
              <td className="px-4 py-3 text-sage">{formatBytes(item.file_size)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    item.visibility === 'public'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {item.visibility === 'public' ? 'Public' : 'Private'}
                </span>
              </td>
              <td className="px-4 py-3 text-base leading-none" title={item.is_ai_context ? 'AI context' : 'Not AI context'}>
                {item.is_ai_context ? '⭐' : '—'}
              </td>
              <td className="px-4 py-3 text-sage">
                {new Date(item.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
