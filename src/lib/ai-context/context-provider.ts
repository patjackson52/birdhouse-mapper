import type { AiContextSummary } from './types';

export interface KnowledgeContextItem {
  title: string;
  tags: string[];
  bodyText: string;
}

export function buildOrgContextBlock(
  summary: AiContextSummary | null,
  knowledgeItems?: KnowledgeContextItem[]
): string {
  if (!summary) return '';

  const fileEntries = summary.content_map
    .map(entry => `  - ${entry.filename}: ${entry.summary}`)
    .join('\n');

  let knowledgeSection = '';
  if (knowledgeItems && knowledgeItems.length > 0) {
    const knowledgeEntries = knowledgeItems
      .map(item => {
        const tagsStr = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
        return `  **${item.title}**${tagsStr}\n  ${item.bodyText}`;
      })
      .join('\n\n');
    knowledgeSection = `\n\n## Knowledge Base\n\n<knowledge-base>\n${knowledgeEntries}\n</knowledge-base>`;
  }

  return `<org-context>\n${summary.org_profile}\n\n<available-context-files>\n${fileEntries}\n</available-context-files>${knowledgeSection}\n</org-context>`;
}
