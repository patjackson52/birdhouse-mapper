'use client';

import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { arrayMove } from '@dnd-kit/sortable';
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, BlockType, BlockConfig, SpacingPreset } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayout } from '@/lib/layout/defaults';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPalette from './BlockPalette';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRenderer from '../LayoutRenderer';
import FormPreview from '../preview/FormPreview';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayout, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

type PreviewTab = 'detail' | 'form';

function getDefaultConfig(type: BlockType): BlockConfig {
  switch (type) {
    case 'field_display': return { fieldId: '', size: 'normal' as const, showLabel: true };
    case 'photo_gallery': return { style: 'hero' as const, maxPhotos: 4 };
    case 'timeline': return { showUpdates: true, showScheduled: false, maxItems: 5 };
    case 'text_label': return { text: 'Section Title', style: 'heading' as const };
    case 'entity_list': return { entityTypeIds: [] };
    default: return {};
  }
}

export default function LayoutBuilder({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayout>(
    () => initialLayout ?? generateDefaultLayout(customFields),
  );
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Combine real fields + pending fields for preview
  const allFields: CustomField[] = [
    ...customFields,
    ...pendingFields.map((f, i) => ({
      id: f.tempId,
      item_type_id: itemType.id,
      name: f.name,
      field_type: f.field_type as CustomField['field_type'],
      options: f.options.length > 0 ? f.options : null,
      required: f.required,
      sort_order: customFields.length + i,
      org_id: itemType.org_id,
    })),
  ];

  const mockItem = generateMockItem(itemType, allFields);

  const handleAddBlock = useCallback((type: BlockType | 'row') => {
    setLayout((prev) => {
      if (type === 'row') {
        const newRow: LayoutRow = {
          id: nanoid(10),
          type: 'row',
          children: [
            { id: nanoid(10), type: 'status_badge', config: {} },
            { id: nanoid(10), type: 'status_badge', config: {} },
          ],
          gap: 'normal',
          distribution: 'equal',
        };
        return { ...prev, blocks: [...prev.blocks, newRow] };
      }
      const newBlock: LayoutBlock = {
        id: nanoid(10),
        type: type,
        config: getDefaultConfig(type),
      };
      return { ...prev, blocks: [...prev.blocks, newBlock] };
    });
  }, []);

  const handleReorder = useCallback((activeId: string, overId: string) => {
    setLayout((prev) => {
      const oldIndex = prev.blocks.findIndex((b) => b.id === activeId);
      const newIndex = prev.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, blocks: arrayMove(prev.blocks, oldIndex, newIndex) };
    });
  }, []);

  const handleConfigChange = useCallback((blockId: string, config: BlockConfig) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRow(node)) {
          return { ...node, config };
        }
        if (isLayoutRow(node)) {
          return {
            ...node,
            children: node.children.map((c) =>
              c.id === blockId ? { ...c, config } : c,
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  }, []);

  const handleCreateField = useCallback((field: { name: string; field_type: string; options: string[]; required: boolean }) => {
    const tempId = `temp-${nanoid(10)}`;
    setPendingFields((prev) => [...prev, { ...field, tempId }]);
    // Auto-update the last field_display block that has no fieldId
    setLayout((prev) => {
      const blocks = [...prev.blocks];
      for (let i = blocks.length - 1; i >= 0; i--) {
        const node = blocks[i];
        if (!isLayoutRow(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
          blocks[i] = { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfig };
          return { ...prev, blocks };
        }
      }
      return prev;
    });
  }, []);

  const handlePeekCountChange = useCallback((count: number) => {
    setLayout((prev) => ({ ...prev, peekBlockCount: count }));
  }, []);

  const handleSpacingChange = useCallback((spacing: SpacingPreset) => {
    setLayout((prev) => ({ ...prev, spacing }));
  }, []);

  const handleRowChange = useCallback((rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) =>
        node.id === rowId && isLayoutRow(node) ? { ...node, ...update } : node,
      ),
    }));
  }, []);

  const handleAddToRow = useCallback((rowId: string, blockType: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === rowId && isLayoutRow(node) && node.children.length < 4) {
          return {
            ...node,
            children: [
              ...node.children,
              { id: nanoid(10), type: blockType as BlockType, config: getDefaultConfig(blockType as BlockType) },
            ],
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleRemoveFromRow = useCallback((rowId: string, blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === rowId && isLayoutRow(node)) {
          const remaining = node.children.filter((c) => c.id !== blockId);
          if (remaining.length <= 1) {
            return remaining[0] ?? node;
          }
          return { ...node, children: remaining };
        }
        return node;
      }),
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(layout, pendingFields.map(({ tempId, ...rest }) => rest));
    } finally {
      setSaving(false);
    }
  };

  // Build panel content
  const buildContent = (
    <div className="space-y-4">
      <BlockPalette onAdd={handleAddBlock} />
      <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
      <BlockList
        nodes={layout.blocks}
        customFields={allFields}
        entityTypes={entityTypes}
        peekBlockCount={layout.peekBlockCount}
        onReorder={handleReorder}
        onConfigChange={handleConfigChange}
        onDeleteBlock={handleDeleteBlock}
        onCreateField={handleCreateField}
        onPeekCountChange={handlePeekCountChange}
        onRowChange={handleRowChange}
        onAddToRow={handleAddToRow}
        onRemoveFromRow={handleRemoveFromRow}
      />
    </div>
  );

  const detailPreview = (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{itemType.icon}</span>
          <h2 className="font-heading font-semibold text-forest-dark text-xl">{mockItem.name}</h2>
        </div>
        <LayoutRenderer
          layout={layout}
          item={mockItem}
          mode="preview"
          context="preview"
          customFields={allFields}
        />
      </div>
    </div>
  );

  const formPreviewContent = (
    <FormPreview layout={layout} customFields={allFields} itemTypeName={itemType.name} />
  );

  // Mobile: full-screen with tabs
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        {/* Sticky header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
          <button onClick={onCancel} className="text-sm text-forest font-medium">
            Cancel
          </button>
          <span className="text-sm font-semibold text-forest-dark">{itemType.name} Layout</span>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-1.5">
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-sage-light">
          {(['build', 'detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-forest border-b-2 border-forest'
                  : 'text-sage'
              }`}
            >
              {tab === 'build' ? 'Build' : tab === 'detail' ? 'Detail' : 'Form'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'build' && buildContent}
          {activeTab === 'detail' && detailPreview}
          {activeTab === 'form' && formPreviewContent}
        </div>
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Builder panel */}
      <div className="flex-[3] overflow-y-auto pr-4 border-r border-sage-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-forest-dark">Layout Builder</h3>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
        {buildContent}
      </div>

      {/* Preview panel */}
      <div className="flex-[2] overflow-y-auto">
        <div className="flex gap-1 mb-3">
          {(['detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPreviewTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                previewTab === tab ? 'bg-forest text-white' : 'bg-sage-light text-forest-dark'
              }`}
            >
              {tab === 'detail' ? 'Detail Preview' : 'Form Preview'}
            </button>
          ))}
        </div>
        {previewTab === 'detail' ? detailPreview : formPreviewContent}
      </div>
    </div>
  );
}
