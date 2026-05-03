'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReport, type PerfEntry } from '@/lib/perf/marks';

const REFRESH_MS = 500;

export function PerfOverlay() {
  const params = useSearchParams();
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<PerfEntry[]>([]);
  const [cacheState, setCacheState] = useState<'cold' | 'warm' | 'unknown'>('unknown');

  useEffect(() => {
    const flag =
      params?.get('perf') === '1' ||
      (typeof window !== 'undefined' && window.localStorage.getItem('perfOverlay') === '1');
    setEnabled(!!flag);
  }, [params]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined') return;
    const sw = (navigator as Navigator).serviceWorker;
    if (!sw) {
      setCacheState('unknown');
      return;
    }
    setCacheState(sw.controller ? 'warm' : 'cold');
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    setEntries(getReport());
    const id = window.setInterval(() => setEntries(getReport()), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  function copyJson() {
    const payload = JSON.stringify({ cacheState, entries }, null, 2);
    navigator.clipboard?.writeText(payload).catch(() => {});
  }

  if (!enabled) return null;

  return (
    <div
      role="region"
      aria-label="Performance overlay"
      data-testid="perf-overlay"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 9999,
        maxHeight: '40vh',
        maxWidth: 360,
        overflow: 'auto',
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        font: '11px ui-monospace, Menlo, monospace',
        padding: 8,
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong>perf · {cacheState}</strong>
        <button
          type="button"
          onClick={copyJson}
          aria-label="Copy performance data"
          style={{ background: '#444', color: '#fff', border: 0, padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}
        >
          copy
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', padding: '2px 4px' }}>name</th>
            <th scope="col" style={{ textAlign: 'right', padding: '2px 4px' }}>start</th>
            <th scope="col" style={{ textAlign: 'right', padding: '2px 4px' }}>dur</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.name}>
              <td style={{ padding: '1px 4px', whiteSpace: 'nowrap' }}>{e.name}</td>
              <td style={{ padding: '1px 4px', textAlign: 'right' }}>{e.startTime.toFixed(0)}</td>
              <td style={{ padding: '1px 4px', textAlign: 'right' }}>{e.duration.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PerfOverlay;
