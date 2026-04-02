'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  FileImage,
  FileSpreadsheet,
  Globe,
  File as FileIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiContextSummary } from '@/lib/ai-context/types';
import type { VaultItem } from '@/lib/vault/types';

interface AiContextPanelProps {
  orgId: string;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return FileIcon;
  if (mimeType.startsWith('image/')) return FileImage;
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/tab-separated-values'
  )
    return FileSpreadsheet;
  if (
    mimeType === 'application/geo+json' ||
    mimeType === 'application/vnd.google-earth.kml+xml' ||
    mimeType === 'application/gpx+xml' ||
    mimeType === 'application/vnd.google-earth.kmz'
  )
    return Globe;
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText;
  return FileIcon;
}

export default function AiContextPanel({ orgId }: AiContextPanelProps) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [summary, setSummary] = useState<AiContextSummary | null>(null);
  const [geoCount, setGeoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [itemsResult, summaryResult, geoResult] = await Promise.all([
        supabase
          .from('vault_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('is_ai_context', true),
        supabase
          .from('ai_context_summary')
          .select('*')
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase
          .from('ai_context_geo_features')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId),
      ]);

      setItems((itemsResult.data as VaultItem[]) ?? []);
      setSummary((summaryResult.data as AiContextSummary | null) ?? null);
      setGeoCount(geoResult.count ?? 0);
      setLoading(false);
    }

    load();
  }, [orgId]);

  // Don't render until we know whether there's context
  if (loading) return null;

  // Return null if there's nothing to show
  if (items.length === 0 && !summary) return null;

  const summaryParts: string[] = [];
  if (items.length > 0) summaryParts.push(`${items.length} ${items.length === 1 ? 'file' : 'files'}`);
  if (geoCount > 0) summaryParts.push(`${geoCount} geo ${geoCount === 1 ? 'feature' : 'features'}`);
  const summaryText = summaryParts.join(' · ');

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Header bar — always visible */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Brain className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium text-amber-800">AI Context</span>
        {summaryText && (
          <span className="text-xs text-amber-600 ml-1">{summaryText}</span>
        )}
        <a
          href="/admin/ai-context"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          Manage
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="p-0.5 text-amber-600 hover:text-amber-800 transition-colors rounded cursor-pointer"
          aria-label={expanded ? 'Collapse AI context' : 'Expand AI context'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="ai-context-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-amber-200 pt-3">
              {/* Org profile summary */}
              {summary?.org_profile && (
                <p className="text-xs text-amber-800 leading-relaxed">{summary.org_profile}</p>
              )}

              {/* File list */}
              {items.length > 0 && (
                <ul className="space-y-1">
                  {items.map((item) => {
                    const Icon = getFileIcon(item.mime_type);
                    return (
                      <li key={item.id} className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs text-amber-800 truncate">{item.file_name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Manage link */}
              <a
                href="/admin/ai-context"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors font-medium"
              >
                Manage in settings
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
