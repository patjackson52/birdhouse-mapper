import Image from '@tiptap/extension-image';

/**
 * Custom TipTap Image extension that stores a vault item ID
 * alongside the standard src/alt attributes.
 */
export const VaultImage = Image.extend({
  name: 'vaultImage',

  addAttributes() {
    return {
      ...this.parent?.(),
      vaultItemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-vault-item-id'),
        renderHTML: (attributes) => {
          if (!attributes.vaultItemId) return {};
          return { 'data-vault-item-id': attributes.vaultItemId };
        },
      },
    };
  },
});
