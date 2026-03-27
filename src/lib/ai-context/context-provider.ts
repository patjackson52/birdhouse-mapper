import type { AiContextSummary } from './types';

export function buildOrgContextBlock(summary: AiContextSummary | null): string {
  if (!summary) return '';
  const fileEntries = summary.content_map
    .map(entry => `  - ${entry.filename}: ${entry.summary}`)
    .join('\n');
  return `<org-context>\n${summary.org_profile}\n\n<available-context-files>\n${fileEntries}\n</available-context-files>\n</org-context>`;
}
