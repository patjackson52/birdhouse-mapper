import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { VaultImage } from './VaultImageExtension';
import { LineHeight } from './LineHeightExtension';

export function getEditorExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    VaultImage,
    LineHeight,
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing…',
    }),
  ];
}
