import { describe, it, expect } from 'vitest';
import { buildOrgContextBlock } from '@/lib/ai-context/context-provider';
import type { AiContextSummary } from '@/lib/ai-context/types';

describe('buildOrgContextBlock', () => {
  it('returns empty string when no summary exists', () => {
    expect(buildOrgContextBlock(null)).toBe('');
  });

  it('builds XML context block from summary', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'Coastal Maine conservation org.',
      content_map: [
        { item_id: 'item-1', filename: 'guide.pdf', summary: '47 species entries' },
      ],
      last_rebuilt_at: '2026-03-27T00:00:00Z',
      version: 1,
    };
    const result = buildOrgContextBlock(summary);
    expect(result).toContain('<org-context>');
    expect(result).toContain('Coastal Maine conservation org.');
    expect(result).toContain('guide.pdf');
    expect(result).toContain('47 species entries');
    expect(result).toContain('</org-context>');
  });
});
