import type { Data } from '@puckeditor/core';

/**
 * Prop names that are richtext fields in Puck component configs.
 * Puck's RichTextRender crashes when these are empty strings — it creates
 * { type: "text", text: "" } which ProseMirror rejects. Setting to null
 * makes Puck create a safe empty doc instead.
 */
const RICHTEXT_PROP_NAMES = ['content', 'text', 'quote'];

/**
 * Sanitize Puck data to prevent ProseMirror "Empty text nodes" crash.
 *
 * Root cause: Puck's RichTextRender converts empty string "" to
 * { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] }
 * which crashes ProseMirror's Node.fromJSON. Setting empty richtext to null
 * makes Puck use { type: "doc", content: [] } instead (safe).
 */
export function sanitizePuckData(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data));

  function walkComponents(
    components: Array<{ type: string; props: Record<string, unknown> }>
  ) {
    for (const component of components) {
      if (!component.props) continue;
      // Nullify empty richtext strings to prevent ProseMirror crash
      for (let i = 0; i < RICHTEXT_PROP_NAMES.length; i++) {
        const key = RICHTEXT_PROP_NAMES[i];
        if (component.props[key] === '') {
          component.props[key] = null;
        }
      }
      // Recursively walk slot content (arrays of components in props)
      for (const value of Object.values(component.props)) {
        if (Array.isArray(value) && value.length > 0 && value[0]?.type && value[0]?.props) {
          walkComponents(value);
        }
      }
    }
  }

  if (clone.content) {
    walkComponents(clone.content);
  }

  if (clone.zones) {
    for (const zone of Object.values(clone.zones)) {
      walkComponents(zone as Array<{ type: string; props: Record<string, unknown> }>);
    }
  }

  // Chrome root content also has components with richtext
  if (clone.root?.content) {
    walkComponents(clone.root.content);
  }

  return clone;
}
