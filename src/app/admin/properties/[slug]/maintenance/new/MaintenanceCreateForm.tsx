'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMaintenanceProject } from '@/lib/maintenance/actions';

interface Props {
  orgId: string;
  propertyId: string;
  propertySlug: string;
}

export function MaintenanceCreateForm({ orgId, propertyId, propertySlug }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createMaintenanceProject({
      orgId,
      propertyId,
      title,
      description: description || undefined,
      scheduledFor: scheduledFor || null,
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/admin/properties/${propertySlug}/maintenance/${result.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          className="input-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea
          id="description"
          className="input-field min-h-[96px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
        />
      </div>

      <div>
        <label className="label" htmlFor="scheduled_for">Scheduled date</label>
        <input
          id="scheduled_for"
          type="date"
          className="input-field"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
      </div>

      {error && <div className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/admin/properties/${propertySlug}/maintenance`)}
          className="btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
