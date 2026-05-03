import type { Data } from '@puckeditor/core';
import { sanitizeRichTextHtml } from './sanitize-html';

/**
 * Prop names that are richtext fields in Puck component configs.
 * Puck's RichTextRender crashes when these are empty strings — it creates
 * { type: "text", text: "" } which ProseMirror rejects. Setting to null
 * makes Puck create a safe empty doc instead.
 */
const RICHTEXT_PROP_NAMES = ['content', 'text', 'quote'];

type Component = { type: string; props: Record<string, unknown> };

/**
 * Walk every Puck component in the data tree and call `fn` for each
 * richtext-typed prop. The callback's return value replaces the prop value.
 */
function walkRichTextProps(
  data: Data,
  fn: (key: string, value: unknown) => unknown
): void {
  function walkComponents(components: Component[]) {
    for (const component of components) {
      if (!component.props) continue;
      for (const key of RICHTEXT_PROP_NAMES) {
        if (key in component.props) {
          component.props[key] = fn(key, component.props[key]);
        }
      }
      // Recursively walk slot content (arrays of components in props)
      for (const value of Object.values(component.props)) {
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          (value[0] as Component | undefined)?.type &&
          (value[0] as Component | undefined)?.props
        ) {
          walkComponents(value as Component[]);
        }
      }
    }
  }

  if (data.content) walkComponents(data.content as Component[]);
  if (data.zones) {
    for (const zone of Object.values(data.zones)) {
      walkComponents(zone as Component[]);
    }
  }
  const rootContent = (data.root as { content?: Component[] } | undefined)?.content;
  if (rootContent) {
    walkComponents(rootContent);
  }
}

/**
 * Sanitize Puck data on **load** to prevent ProseMirror "Empty text nodes"
 * crash. Puck's RichTextRender converts empty string "" to a doc with a
 * zero-length text node which crashes ProseMirror's Node.fromJSON. Setting
 * empty richtext to null makes Puck use { type: "doc", content: [] }
 * instead (safe).
 */
export function sanitizePuckData(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data)) as Data;
  walkRichTextProps(clone, (_key, value) => (value === '' ? null : value));
  return clone;
}

/**
 * Sanitize Puck data on **write**. Performs everything sanitizePuckData does
 * and additionally runs every non-empty richtext string through
 * sanitizeRichTextHtml — strips disallowed tags/attributes, normalizes NBSP
 * runs, blocks javascript:/data: URIs.
 *
 * Call from server actions before persisting to Supabase.
 */
export function sanitizePuckDataForWrite(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data)) as Data;
  walkRichTextProps(clone, (_key, value) => {
    if (value === '') return null;
    if (typeof value === 'string') return sanitizeRichTextHtml(value);
    return value;
  });
  return clone;
}
