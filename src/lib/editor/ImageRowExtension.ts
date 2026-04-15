import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageRow: {
      wrapInImageRow: () => ReturnType;
    };
  }
}

/**
 * ImageRow: block node that holds 1+ vaultImage nodes displayed side-by-side.
 * Rendered as <div data-type="image-row" class="image-row">.
 */
export const ImageRow = Node.create({
  name: 'imageRow',
  group: 'block',
  content: 'vaultImage+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="image-row"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-row', class: 'image-row' }), 0];
  },

  addCommands() {
    return {
      wrapInImageRow:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const node = selection.$from.node();
          if (node.type.name !== 'vaultImage') return false;

          if (dispatch) {
            const pos = selection.$from.before();
            const imageRowType = state.schema.nodes.imageRow;
            const rowNode = imageRowType.create(null, [node]);
            const tr = state.tr.replaceWith(pos, pos + node.nodeSize, rowNode);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
