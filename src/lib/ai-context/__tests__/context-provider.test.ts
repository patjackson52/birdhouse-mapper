import { describe, it, expect } from 'vitest';
import { buildOrgContextBlock } from '../context-provider';
import type { AiContextSummary } from '../types';

describe('buildOrgContextBlock', () => {
  it('returns empty string for null summary', () => {
    expect(buildOrgContextBlock(null)).toBe('');
  });

  it('includes org profile and content map', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'A bird conservation org.',
      content_map: [
        { item_id: '1', filename: 'guide.pdf', summary: 'Field guide' },
      ],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const result = buildOrgContextBlock(summary);
    expect(result).toContain('A bird conservation org.');
    expect(result).toContain('guide.pdf');
  });

  it('includes knowledge section when items are provided', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'A bird conservation org.',
      content_map: [],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const knowledgeItems = [
      { title: 'How to Clean Birdhouses', tags: ['maintenance'], bodyText: 'Step 1: Remove old nesting material.' },
      { title: 'BirdBox Plans', tags: ['plans'], bodyText: 'Standard box dimensions: 5x5x10 inches.' },
    ];
    const result = buildOrgContextBlock(summary, knowledgeItems);
    expect(result).toContain('Knowledge Base');
    expect(result).toContain('How to Clean Birdhouses');
    expect(result).toContain('Step 1: Remove old nesting material.');
    expect(result).toContain('BirdBox Plans');
  });

  it('excludes knowledge section when no items are provided', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'Test org.',
      content_map: [],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const result = buildOrgContextBlock(summary);
    expect(result).not.toContain('Knowledge Base');
  });
});
