'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Loader2,
  AlertCircle,
  FileText,
  FileImage,
  FileSpreadsheet,
  MapPin,
  Globe,
  File as FileIcon,
} from 'lucide-react';
import type { AiContextProcessingStatus } from '@/lib/ai-context/types';

export interface ProcessingItem {
  id: string;
  fileName: string;
  mimeType: string;
  status: AiContextProcessingStatus;
  contentSummary: string | null;
  geoCount: number;
}

export interface ProcessingProgressProps {
  items: ProcessingItem[];
  summaryReady: boolean;
  orgProfile?: string | null;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel'
  )
    return FileSpreadsheet;
  if (
    mimeType === 'application/geo+json' ||
    mimeType === 'application/vnd.google-earth.kml+xml' ||
    mimeType === 'application/gpx+xml'
  )
    return Globe;
  if (mimeType.startsWith('text/') || mimeType === 'application/pdf') return FileText;
  return FileIcon;
}

function StatusIcon({ status }: { status: AiContextProcessingStatus }) {
  if (status === 'pending') {
    return (
      <span className="w-5 h-5 rounded-full border-2 border-stone-300 flex-shrink-0 block" />
    );
  }

  if (status === 'processing') {
    return (
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="flex-shrink-0 flex items-center justify-center"
      >
        <Loader2 className="w-5 h-5 text-amber-500" />
      </motion.span>
    );
  }

  if (status === 'complete') {
    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"
      >
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
      </motion.span>
    );
  }

  // error
  return <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
}

export default function ProcessingProgress({
  items,
  summaryReady,
  orgProfile,
}: ProcessingProgressProps) {
  const total = items.length;
  const completed = items.filter(
    (item) => item.status === 'complete' || item.status === 'error'
  ).length;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;
  const totalGeoCount = items.reduce((sum, item) => sum + item.geoCount, 0);

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-stone-700">
            Analyzing {total} {total === 1 ? 'file' : 'files'}
          </span>
          <span className="text-stone-500">
            {completed} / {total}
          </span>
        </div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-amber-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Per-file list */}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const Icon = getFileIcon(item.mimeType);
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: index * 0.05, duration: 0.25 }}
                className="flex items-start gap-3 rounded-lg bg-stone-50 border border-stone-100 px-3 py-2.5"
              >
                <StatusIcon status={item.status} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-stone-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-stone-800 truncate">
                      {item.fileName}
                    </span>
                    {item.geoCount > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <MapPin className="w-3 h-3" />
                        {item.geoCount}
                      </span>
                    )}
                  </div>

                  <AnimatePresence>
                    {item.status === 'complete' && item.contentSummary && (
                      <motion.p
                        key="summary"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-1 text-xs text-stone-500 leading-relaxed overflow-hidden"
                      >
                        {item.contentSummary}
                      </motion.p>
                    )}
                    {item.status === 'error' && (
                      <motion.p
                        key="error"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-1 text-xs text-red-500 overflow-hidden"
                      >
                        Analysis failed — this file will be skipped
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {/* Org profile preview */}
      <AnimatePresence>
        {summaryReady && orgProfile && (
          <motion.div
            key="org-profile"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Organisation Profile
              </span>
              {totalGeoCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  {totalGeoCount} location{totalGeoCount !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">{orgProfile}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
