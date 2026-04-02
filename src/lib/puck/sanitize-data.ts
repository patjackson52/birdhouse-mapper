import type { Data } from '@puckeditor/core';

/**
 * Recursively remove empty text nodes from a ProseMirror JSON tree.
 * ProseMirror throws `RangeError: Empty text nodes are not allowed`
 * when encountering `{ type: "text", text: "" }` during deserialization.
 */
function stripEmptyTextNodes(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node
      .filter(
        (item) =>
          !(
            item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            (item as Record<string, unknown>).type === 'text' &&
            !(item as Record<string, unknown>).text
          )
      )
      .map(stripEmptyTextNodes);
  }
  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = stripEmptyTextNodes(value);
  }
  return result;
}

/**
 * If a string looks like stringified ProseMirror JSON, parse and sanitize it.
 */
function sanitizeStringValue(value: string): string | unknown {
  if (
    value.startsWith('{') &&
    value.includes('"type"') &&
    value.includes('"content"')
  ) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        return stripEmptyTextNodes(parsed);
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }
  return value;
}

/**
 * Sanitize Puck data to remove empty text nodes from richtext (ProseMirror/TipTap) content.
 *
 * Handles three cases:
 * 1. ProseMirror JSON nested as objects in component props
 * 2. ProseMirror JSON stored as stringified JSON strings in component props
 * 3. Deeply nested content in zones and slots
 */
export function sanitizePuckData(data: Data): Data {
  const clone = JSON.parse(JSON.stringify(data));

  function walkProps(props: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        result[key] = sanitizeStringValue(value);
      } else if (value && typeof value === 'object') {
        result[key] = stripEmptyTextNodes(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function walkComponents(
    components: Array<{ type: string; props: Record<string, unknown> }>
  ) {
    for (const component of components) {
      component.props = walkProps(component.props);
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

  // Also walk root props (chrome components may have richtext fields)
  if (clone.root?.props) {
    clone.root.props = walkProps(clone.root.props);
  }

  return clone;
}
