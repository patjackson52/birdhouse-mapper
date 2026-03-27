'use client';

import {
  FileText,
  FileImage,
  FileSpreadsheet,
  Globe,
  MapPin,
  File as FileIcon,
  Download,
  Trash2,
} from 'lucide-react';
import type { AiContextItem, AiContextProcessingStatus } from '@/lib/ai-context/types';

interface AiContextTableProps {
  items: Array<AiContextItem & { geo_count: number }>;
  onDelete: (id: string) => void;
  onDownload: (item: AiContextItem) => void;
  canManage: boolean;
  canDownload: boolean;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(sourceType: string, mimeType: string | null): React.ReactNode {
  const mime = mimeType ?? '';

  if (sourceType === 'url') {
    return <Globe className="w-4 h-4 text-blue-500 shrink-0" />;
  }
  if (mime.startsWith('image/')) {
    return <FileImage className="w-4 h-4 text-blue-400 shrink-0" />;
  }
  if (mime === 'application/pdf') {
    return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
  }
  if (
    mime === 'text/csv' ||
    mime === 'text/tab-separated-values' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />;
  }
  if (
    mime === 'application/geo+json' ||
    mime === 'application/vnd.google-earth.kml+xml' ||
    mime === 'application/vnd.google-earth.kmz' ||
    mime === 'application/gpx+xml'
  ) {
    return <MapPin className="w-4 h-4 text-cyan-500 shrink-0" />;
  }
  if (mime.startsWith('text/')) {
    return <FileText className="w-4 h-4 text-stone-400 shrink-0" />;
  }
  return <FileIcon className="w-4 h-4 text-stone-400 shrink-0" />;
}

function StatusBadge({ status }: { status: AiContextProcessingStatus }) {
  const config: Record<AiContextProcessingStatus, { label: string; className: string }> = {
    complete: {
      label: 'Complete',
      className: 'bg-green-50 text-green-700 border-green-200',
    },
    processing: {
      label: 'Processing',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    pending: {
      label: 'Pending',
      className: 'bg-stone-50 text-stone-500 border-stone-200',
    },
    error: {
      label: 'Error',
      className: 'bg-red-50 text-red-700 border-red-200',
    },
  };

  const { label, className } = config[status] ?? config.pending;

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

export default function AiContextTable({
  items,
  onDelete,
  onDownload,
  canManage,
  canDownload,
}: AiContextTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-stone-400">
        No files uploaded yet.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-sage-light bg-sage-light">
              <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">File</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                AI Summary
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Geo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
              {(canDownload || canManage) && (
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-sage-light">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-sage-light/30 transition-colors">
                {/* File column */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(item.source_type, item.mime_type)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-forest-dark truncate max-w-[200px]">
                        {item.file_name}
                      </p>
                      <p className="text-xs text-sage">{formatFileSize(item.file_size)}</p>
                    </div>
                  </div>
                </td>

                {/* AI Summary — hidden on mobile */}
                <td className="px-4 py-3 hidden md:table-cell">
                  {item.content_summary ? (
                    <p className="text-xs text-stone-500 leading-relaxed line-clamp-2 max-w-xs">
                      {item.content_summary}
                    </p>
                  ) : (
                    <span className="text-xs text-stone-300 italic">—</span>
                  )}
                </td>

                {/* Geo count */}
                <td className="px-4 py-3">
                  {item.geo_count > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                      <MapPin className="w-3 h-3" />
                      {item.geo_count}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-300">—</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={item.processing_status} />
                  {item.processing_status === 'error' && item.processing_error && (
                    <p className="text-xs text-red-500 mt-1 max-w-[120px] truncate" title={item.processing_error}>
                      {item.processing_error}
                    </p>
                  )}
                </td>

                {/* Actions */}
                {(canDownload || canManage) && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canDownload && item.storage_path && (
                        <button
                          onClick={() => onDownload(item)}
                          title="Download"
                          className="p-1.5 text-stone-400 hover:text-forest-dark transition-colors rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                          className="p-1.5 text-stone-400 hover:text-red-600 transition-colors rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
