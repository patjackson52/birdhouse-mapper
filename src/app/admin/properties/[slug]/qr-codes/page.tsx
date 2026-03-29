'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { createQrCode, getQrCodes, deleteQrCode, getQrCodeStats } from './actions';
import { createClient } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type QrCodeRow = {
  slug: string;
  placement: string;
  label: string | null;
  scan_count: number;
  created_at: string;
};

export default function QrCodesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [qrCodes, setQrCodes] = useState<QrCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [placement, setPlacement] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('properties')
      .select('id')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (data) {
          setPropertyId(data.id);
          loadQrCodes(data.id);
        }
      });
  }, [slug]);

  async function loadQrCodes(propId: string) {
    setLoading(true);
    const result = await getQrCodes(propId);
    if ('qrCodes' in result) {
      setQrCodes(result.qrCodes ?? []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !placement.trim()) return;

    setCreating(true);
    setError('');

    const result = await createQrCode({
      propertyId,
      propertySlug: slug,
      placement: placement.trim(),
      label: label.trim() || undefined,
    });

    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
    } else {
      setPlacement('');
      setLabel('');
      await loadQrCodes(propertyId);
    }
    setCreating(false);
  }

  async function handleDelete(qrSlug: string) {
    if (!propertyId) return;
    const result = await deleteQrCode(qrSlug);
    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
    } else {
      await loadQrCodes(propertyId);
    }
  }

  async function handleToggleStats(qrSlug: string) {
    if (expandedSlug === qrSlug) {
      setExpandedSlug(null);
      setStats(null);
      return;
    }
    setExpandedSlug(qrSlug);
    setStatsLoading(true);
    const result = await getQrCodeStats(qrSlug);
    if ('dailyCounts' in result) {
      setStats(result.dailyCounts ?? null);
    }
    setStatsLoading(false);
  }

  function getQrUrl(qrSlug: string) {
    const host = typeof window !== 'undefined' ? window.location.origin : '';
    return `${host}/go/${qrSlug}`;
  }

  function downloadQrCode(qrSlug: string) {
    const svg = document.getElementById(`qr-${qrSlug}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx!.fillStyle = 'white';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);

      const link = document.createElement('a');
      link.download = `qr-${qrSlug}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
        QR Codes
      </h1>
      <p className="text-sm text-sage mb-6">
        Create QR codes for physical placements that link visitors to this property&apos;s landing page.
      </p>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="card mb-8">
        <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
          New QR Code Placement
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="placement" className="label">
              Placement ID
            </label>
            <input
              id="placement"
              type="text"
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className="input-field"
              placeholder="e.g., park-entrance"
              required
            />
            <p className="text-xs text-sage mt-1">
              Used in the URL: /go/{slug}-{placement ? placement.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '...'}
            </p>
          </div>
          <div>
            <label htmlFor="label" className="label">
              Label (optional)
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input-field"
              placeholder="e.g., Main Park Entrance Sign"
            />
          </div>
        </div>
        <button type="submit" disabled={creating || !placement.trim()} className="btn-primary">
          {creating ? 'Creating...' : 'Create QR Code'}
        </button>
      </form>

      {/* QR code list */}
      {qrCodes.length === 0 ? (
        <div className="text-center py-12 text-sage">
          <p className="text-lg mb-1">No QR codes yet</p>
          <p className="text-sm">Create your first placement above to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {qrCodes.map((qr) => (
            <div key={qr.slug} className="card">
              <div className="flex items-start gap-4">
                {/* QR code preview */}
                <div className="shrink-0">
                  <QRCodeSVG
                    id={`qr-${qr.slug}`}
                    value={getQrUrl(qr.slug)}
                    size={120}
                    level="M"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-forest-dark">
                    {qr.label || qr.placement}
                  </h3>
                  <p className="text-xs text-sage mt-0.5 font-mono truncate">
                    {getQrUrl(qr.slug)}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-sage">
                    <span>{qr.scan_count} scan{qr.scan_count !== 1 ? 's' : ''}</span>
                    <span>Created {new Date(qr.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => downloadQrCode(qr.slug)}
                      className="text-xs text-forest hover:text-forest-dark transition-colors"
                    >
                      Download PNG
                    </button>
                    <button
                      onClick={() => handleToggleStats(qr.slug)}
                      className="text-xs text-forest hover:text-forest-dark transition-colors"
                    >
                      {expandedSlug === qr.slug ? 'Hide Stats' : 'View Stats'}
                    </button>
                    <button
                      onClick={() => handleDelete(qr.slug)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded stats */}
              {expandedSlug === qr.slug && (
                <div className="mt-4 pt-4 border-t border-sage-light">
                  {statsLoading ? (
                    <div className="flex justify-center py-4">
                      <LoadingSpinner />
                    </div>
                  ) : stats && Object.keys(stats).length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium text-forest-dark mb-2">
                        Scans — Last 30 Days
                      </h4>
                      <div className="flex items-end gap-0.5 h-24">
                        {(() => {
                          // Build array of last 30 days
                          const days: { date: string; count: number }[] = [];
                          for (let i = 29; i >= 0; i--) {
                            const d = new Date();
                            d.setDate(d.getDate() - i);
                            const key = d.toISOString().slice(0, 10);
                            days.push({ date: key, count: stats[key] || 0 });
                          }
                          const max = Math.max(...days.map((d) => d.count), 1);
                          return days.map((day) => (
                            <div
                              key={day.date}
                              className="flex-1 bg-forest/60 hover:bg-forest rounded-t transition-colors"
                              style={{ height: `${(day.count / max) * 100}%`, minHeight: day.count > 0 ? '4px' : '1px' }}
                              title={`${day.date}: ${day.count} scan${day.count !== 1 ? 's' : ''}`}
                            />
                          ));
                        })()}
                      </div>
                      <div className="flex justify-between text-xs text-sage mt-1">
                        <span>30 days ago</span>
                        <span>Today</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-sage text-center py-2">No scans recorded yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
