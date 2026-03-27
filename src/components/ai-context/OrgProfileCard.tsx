'use client';

import type { AiContextSummary } from '@/lib/ai-context/types';

interface OrgProfileCardProps {
  summary: AiContextSummary | null;
}

export default function OrgProfileCard({ summary }: OrgProfileCardProps) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-500">
        No AI context uploaded yet. Add files, URLs, or text to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Organization Profile (AI-Generated)
        </span>
        <span className="text-xs text-amber-600 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
          v{summary.version}
        </span>
      </div>
      <p className="text-sm text-amber-900 leading-relaxed">{summary.org_profile}</p>
    </div>
  );
}
