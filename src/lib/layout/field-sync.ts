import type { TypeLayout, LayoutNode, LayoutBlock, FieldDisplayConfig } from './types';
import { isLayoutRow } from './types';

/**
 * Remove all field_display blocks referencing a given fieldId.
 * If a row is left with <2 children, unwrap it to a single block.
 */
export function removeFieldFromLayout(layout: TypeLayout, fieldId: string): TypeLayout {
  const blocks: LayoutNode[] = [];

  for (const node of layout.blocks) {
    if (isLayoutRow(node)) {
      const filtered = node.children.filter(
        (c) => !(c.type === 'field_display' && (c.config as FieldDisplayConfig).fieldId === fieldId),
      );
      if (filtered.length === 0) continue;
      if (filtered.length === 1) {
        blocks.push(filtered[0]);
      } else {
        blocks.push({ ...node, children: filtered });
      }
    } else {
      if (node.type === 'field_display' && (node.config as FieldDisplayConfig).fieldId === fieldId) {
        continue;
      }
      blocks.push(node);
    }
  }

  return { ...layout, blocks };
}

/**
 * Find field IDs that are not referenced by any field_display block in the layout.
 */
export function findFieldsNotInLayout(layout: TypeLayout, fieldIds: string[]): string[] {
  const inLayout = new Set<string>();

  function scanBlock(block: LayoutBlock) {
    if (block.type === 'field_display') {
      inLayout.add((block.config as FieldDisplayConfig).fieldId);
    }
  }

  for (const node of layout.blocks) {
    if (isLayoutRow(node)) {
      node.children.forEach(scanBlock);
    } else {
      scanBlock(node);
    }
  }

  return fieldIds.filter((id) => !inLayout.has(id));
}
