/**
 * Monkey-patch ProseMirror's Node.fromJSON to skip empty text nodes
 * instead of throwing "Empty text nodes are not allowed".
 *
 * This is necessary because Puck/Tiptap may generate or encounter
 * empty text nodes during editor initialization, and the crash is
 * unrecoverable without this patch.
 */
export function patchProseMirrorFromJSON() {
  try {
    const { Node } = require('prosemirror-model');
    const originalFromJSON = Node.fromJSON;

    Node.fromJSON = function patchedFromJSON(schema: any, json: any) {
      // Skip empty text nodes instead of throwing
      if (json && json.type === 'text' && !json.text) {
        // Return null to signal this node should be skipped
        return null;
      }
      return originalFromJSON.call(this, schema, json);
    };

    // Also patch Fragment.fromJSON to filter out null nodes
    const { Fragment } = require('prosemirror-model');
    const originalFragmentFromJSON = Fragment.fromJSON;

    Fragment.fromJSON = function patchedFragmentFromJSON(schema: any, value: any) {
      if (!value) return Fragment.empty;
      if (!Array.isArray(value))
        throw new RangeError('Invalid input for Fragment.fromJSON');
      const nodes = value
        .map((item: any) => Node.fromJSON(schema, item))
        .filter(Boolean); // Remove null nodes (skipped empty text nodes)
      return Fragment.from(nodes);
    };
  } catch {
    // prosemirror-model not available, skip patching
  }
}
