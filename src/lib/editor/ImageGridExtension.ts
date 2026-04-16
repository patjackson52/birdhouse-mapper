import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGrid: {
      wrapInImageGrid: () => ReturnType;
      setGridColumns: (columns: number) => ReturnType;
      unwrapImageGrid: () => ReturnType;
    };
  }
}

/**
 * ImageGrid: block node that holds 1+ vaultImage nodes displayed in a CSS grid.
 * Supports 2-4 columns with aspect-ratio-based image heights.
 * Backward-compatible: parses legacy data-type="image-row" content.
 */
export const ImageGrid = Node.create({
  name: 'imageGrid',
  group: 'block',
  content: 'vaultImage+',
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-columns');
          return raw ? Number(raw) : 2;
        },
        renderHTML: (attributes) => {
          return { 'data-columns': String(attributes.columns) };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="image-grid"]' },
      { tag: 'div[data-type="image-row"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { 'data-columns': columns, ...rest } = HTMLAttributes;
    return [
      'div',
      mergeAttributes(rest, {
        'data-type': 'image-grid',
        'data-columns': columns,
        class: 'image-grid',
        style: `--grid-cols: ${columns}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      wrapInImageGrid:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const pos = selection.from;
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'vaultImage') return false;

          if (dispatch) {
            const gridType = state.schema.nodes.imageGrid;
            const gridNode = gridType.create({ columns: 2 }, [node]);
            const tr = state.tr.replaceWith(pos, pos + node.nodeSize, gridNode);
            dispatch(tr);
          }
          return true;
        },

      setGridColumns:
        (columns: number) =>
        ({ state, dispatch }) => {
          const { selection } = state;
          for (let d = selection.$from.depth; d > 0; d--) {
            const parentNode = selection.$from.node(d);
            if (parentNode.type.name === 'imageGrid') {
              if (dispatch) {
                const pos = selection.$from.before(d);
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...parentNode.attrs,
                  columns,
                });
                dispatch(tr);
              }
              return true;
            }
          }
          return false;
        },

      unwrapImageGrid:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          for (let d = selection.$from.depth; d > 0; d--) {
            const parentNode = selection.$from.node(d);
            if (parentNode.type.name === 'imageGrid') {
              if (dispatch) {
                const pos = selection.$from.before(d);
                const children: typeof parentNode[] = [];
                parentNode.forEach((child) => children.push(child));
                const tr = state.tr.replaceWith(
                  pos,
                  pos + parentNode.nodeSize,
                  children
                );
                dispatch(tr);
              }
              return true;
            }
          }
          return false;
        },
    };
  },
});
