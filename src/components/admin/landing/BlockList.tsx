'use client';

import { useState } from 'react';
import type { LandingBlock, LandingAsset } from '@/lib/config/landing-types';
import BlockEditor from '@/components/admin/landing/BlockEditor';

const MAX_BLOCKS = 50;

const BLOCK_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  hero: { label: 'Hero', color: 'bg-blue-100 text-blue-700' },
  text: { label: 'Text', color: 'bg-green-100 text-green-700' },
  image: { label: 'Image', color: 'bg-purple-100 text-purple-700' },
  button: { label: 'Button', color: 'bg-violet-100 text-violet-700' },
  links: { label: 'Links', color: 'bg-teal-100 text-teal-700' },
  stats: { label: 'Stats', color: 'bg-amber-100 text-amber-700' },
  gallery: { label: 'Gallery', color: 'bg-pink-100 text-pink-700' },
  spacer: { label: 'Spacer', color: 'bg-gray-100 text-gray-700' },
};

const BLOCK_TYPES = ['hero', 'text', 'image', 'button', 'links', 'stats', 'gallery', 'spacer'] as const;

function getBlockSummary(block: LandingBlock): string {
  switch (block.type) {
    case 'hero':
      return block.title || '(untitled)';
    case 'text':
      return block.content.slice(0, 60) || '(empty)';
    case 'button':
      return `${block.label || '?'} \u2192 ${block.href || '?'}`;
    case 'links':
      return `${block.items?.length ?? 0} link(s)`;
    case 'stats':
      return block.source === 'auto' ? 'auto' : 'manual';
    case 'gallery':
      return `${block.images?.length ?? 0} image(s)`;
    case 'image':
      return block.alt || '(no alt text)';
    case 'spacer':
      return `${block.size} spacer`;
    default:
      return '';
  }
}

function createDefaultBlock(type: LandingBlock['type']): LandingBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case 'hero':
      return { id, type: 'hero', title: '', subtitle: '' };
    case 'text':
      return { id, type: 'text', content: '', alignment: 'left' };
    case 'image':
      return { id, type: 'image', url: '', alt: '', width: 'medium' };
    case 'button':
      return { id, type: 'button', label: '', href: '', style: 'primary', size: 'default' };
    case 'links':
      return { id, type: 'links', items: [] };
    case 'stats':
      return { id, type: 'stats', source: 'auto' };
    case 'gallery':
      return { id, type: 'gallery', images: [], columns: 3 };
    case 'spacer':
      return { id, type: 'spacer', size: 'medium' };
  }
}

interface BlockListProps {
  orgId: string;
  blocks: LandingBlock[];
  onBlocksChange: (blocks: LandingBlock[]) => void;
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
}

export default function BlockList({ orgId, blocks, onBlocksChange, assets, onAssetsChange }: BlockListProps) {
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const updated = [...blocks];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onBlocksChange(updated);
  }

  function deleteBlock(index: number) {
    if (!window.confirm('Delete this block?')) return;
    const id = blocks[index].id;
    onBlocksChange(blocks.filter((_, i) => i !== index));
    if (expandedBlockId === id) setExpandedBlockId(null);
  }

  function updateBlock(index: number, updated: LandingBlock) {
    const newBlocks = [...blocks];
    newBlocks[index] = updated;
    onBlocksChange(newBlocks);
  }

  function addBlock(type: LandingBlock['type']) {
    if (blocks.length >= MAX_BLOCKS) return;
    onBlocksChange([...blocks, createDefaultBlock(type)]);
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Blocks ({blocks.length})
      </label>

      {blocks.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">
          No blocks yet. Generate with AI or add blocks manually.
        </p>
      )}

      <div className="space-y-1">
        {blocks.map((block, i) => {
          const badge = BLOCK_TYPE_BADGES[block.type] ?? { label: block.type, color: 'bg-gray-100 text-gray-700' };
          const isExpanded = expandedBlockId === block.id;

          return (
            <div key={block.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.color}`}>
                  {badge.label}
                </span>
                <span className="text-xs text-gray-600 truncate flex-1">
                  {getBlockSummary(block)}
                </span>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => moveBlock(i, -1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs p-1"
                    aria-label="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(i, 1)}
                    disabled={i === blocks.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs p-1"
                    aria-label="Move down"
                  >
                    &#9660;
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBlock(i)}
                    className="text-gray-400 hover:text-red-600 text-sm p-1"
                    aria-label="Delete block"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 py-3 border-t border-gray-200 bg-gray-50">
                  <BlockEditor
                    orgId={orgId}
                    block={block}
                    onChange={(updated) => updateBlock(i, updated)}
                    assets={assets}
                    onAssetsChange={onAssetsChange}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {blocks.length < MAX_BLOCKS && (
        <div className="pt-2">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                addBlock(e.target.value as LandingBlock['type']);
                e.target.value = '';
              }
            }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">+ Add Block...</option>
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {BLOCK_TYPE_BADGES[type].label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
