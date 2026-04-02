import type { Data } from '@puckeditor/core';

/**
 * Recursively removes empty text nodes from ProseMirror JSON content.
 * ProseMirror throws "Empty text nodes are not allowed" when it encounters
 * text nodes with empty string content during deserialization.
 */
function sanitizeProseMirrorNode(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;

  const obj = node as Record<string, unknown>;

  // Filter out empty text nodes from content arrays
  if (Array.isArray(obj.content)) {
    obj.content = obj.content
      .filter((child: unknown) => {
        if (!child || typeof child !== 'object') return true;
        const c = child as Record<string, unknown>;
        // Remove text nodes with empty or missing text
        return !(c.type === 'text' && (!c.text || c.text === ''));
      })
      .map((child: unknown) => sanitizeProseMirrorNode(child));
  }

  return obj;
}

/**
 * Sanitizes Puck editor data by cleaning up richtext field content
 * that may contain empty ProseMirror text nodes.
 */
export function sanitizePuckData(data: Data): Data {
  if (!data) return data;

  const sanitizeComponentProps = (props: Record<string, unknown>) => {
    const cleaned = { ...props };
    for (const [key, value] of Object.entries(cleaned)) {
      // ProseMirror JSON objects have a "type" field (e.g., "doc", "paragraph")
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'type' in value &&
        'content' in value
      ) {
        cleaned[key] = sanitizeProseMirrorNode(structuredClone(value));
      }
    }
    return cleaned;
  };

  const sanitizeComponents = (
    components: Data['content']
  ): Data['content'] =>
    components.map((component) => ({
      ...component,
      props: sanitizeComponentProps(component.props as Record<string, unknown>),
    }));

  const result: Data = {
    ...data,
    content: sanitizeComponents(data.content || []),
  };

  // Also sanitize zone content
  if (data.zones) {
    result.zones = {};
    for (const [zone, components] of Object.entries(data.zones)) {
      result.zones[zone] = sanitizeComponents(components);
    }
  }

  return result;
}
