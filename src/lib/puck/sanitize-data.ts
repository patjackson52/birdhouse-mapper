import type { Data } from '@puckeditor/core';

/**
 * Sanitize Puck data to remove empty text nodes from richtext (ProseMirror/TipTap) content.
 *
 * ProseMirror throws `RangeError: Empty text nodes are not allowed` when deserializing
 * JSON that contains `{ type: "text", text: "" }`. This walks the entire Puck data tree
 * and strips those nodes before the editor loads the data.
 */
export function sanitizePuckData(data: Data): Data {
  return JSON.parse(JSON.stringify(data), (_key, value) => {
    // Look for ProseMirror node content arrays and filter out empty text nodes
    if (Array.isArray(value)) {
      const filtered = value.filter(
        (item) =>
          !(
            item &&
            typeof item === 'object' &&
            item.type === 'text' &&
            (item.text === '' || item.text == null)
          )
      );
      return filtered;
    }
    return value;
  });
}
