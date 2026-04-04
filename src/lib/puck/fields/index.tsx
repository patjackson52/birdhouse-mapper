import { ImagePickerField } from './ImagePickerField';
import { IconPickerField } from './IconPickerField';
import { LinkField } from './LinkField';
import { ColorPickerField } from './ColorPickerField';
import { KnowledgePickerField } from './KnowledgePickerField';

export type { LinkValue, IconValue } from './link-utils';
export { resolveLink } from './link-utils';
export { ImagePickerField } from './ImagePickerField';
export { IconPickerField } from './IconPickerField';
export { LinkField } from './LinkField';
export { ColorPickerField } from './ColorPickerField';
export { PuckSuggestionsProvider, useLinkSuggestions } from './PuckSuggestionsProvider';
export { KnowledgePickerField } from './KnowledgePickerField';

/**
 * Creates a Puck custom field config for an image picker.
 */
export function imagePickerField(label: string, fetchAssets: () => Promise<Array<{ id: string; publicUrl: string; fileName: string }>>) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <ImagePickerField value={value || ''} onChange={onChange} fetchAssets={fetchAssets} />
    ),
  };
}

/**
 * Creates a Puck custom field config for an icon picker.
 */
export function iconPickerField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <IconPickerField value={value} onChange={onChange} />
    ),
  };
}

/**
 * Creates a Puck custom field config for a link field.
 */
export function linkField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <LinkField value={value} onChange={onChange} />
    ),
  };
}

/**
 * Creates a Puck custom field config for a color picker.
 */
export function colorPickerField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <ColorPickerField value={value} onChange={onChange} label={label} />
    ),
  };
}

/**
 * Creates a Puck custom field config for a knowledge article picker.
 * When orgId is omitted, relies on Supabase RLS to scope to the user's orgs.
 */
export function knowledgePickerField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <KnowledgePickerField value={value || ''} onChange={onChange} />
    ),
  };
}
