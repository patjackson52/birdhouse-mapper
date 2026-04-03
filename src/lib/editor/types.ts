import type { JSONContent } from '@tiptap/core';

export type { JSONContent } from '@tiptap/core';

export interface RichTextEditorProps {
  content: JSONContent | null;
  onChange: (json: JSONContent) => void;
  orgId: string;
  editable?: boolean;
}
