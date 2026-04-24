'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteMaintenanceProject,
  updateMaintenanceProject,
  removeItemFromProject,
  setItemCompletion,
  removeKnowledgeFromProject,
} from '@/lib/maintenance/actions';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import { MaintenanceItemPickerInterim } from '@/components/maintenance/MaintenanceItemPickerInterim';
import { MaintenanceKnowledgePickerInterim } from '@/components/maintenance/MaintenanceKnowledgePickerInterim';
import type {
  MaintenanceProject,
  MaintenanceStatus,
  LinkedItem,
  LinkedKnowledge,
} from '@/lib/maintenance/types';

interface Props {
  project: MaintenanceProject;
  propertySlug: string;
  linkedItems?: LinkedItem[];
  linkedKnowledge?: LinkedKnowledge[];
}

export function MaintenanceDetailForm({
  project,
  propertySlug,
  linkedItems = [],
  linkedKnowledge = [],
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [scheduledFor, setScheduledFor] = useState(project.scheduled_for ?? '');
  const [status, setStatus] = useState<MaintenanceStatus>(project.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<null | 'items' | 'knowledge'>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty =
    title !== project.title ||
    description !== (project.description ?? '') ||
    scheduledFor !== (project.scheduled_for ?? '') ||
    status !== project.status;
  const canSave = dirty && title.trim().length > 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateMaintenanceProject(project.id, {
      title,
      description: description || null,
      scheduledFor: scheduledFor || null,
      status,
    });
    setSaving(false);
    if ('error' in result) setError(result.error);
    else router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteMaintenanceProject(project.id);
    if ('error' in result) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push(`/admin/properties/${propertySlug}/maintenance`);
  }

  async function toggleItem(itemId: string, completed: boolean) {
    await setItemCompletion({ projectId: project.id, itemId, completed });
    router.refresh();
  }

  async function removeItem(itemId: string) {
    await removeItemFromProject(project.id, itemId);
    router.refresh();
  }

  async function removeKnowledge(knowledgeId: string) {
    await removeKnowledgeFromProject(project.id, knowledgeId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/admin/properties/${propertySlug}/maintenance`)}
            className="text-sm text-golden hover:opacity-80"
          >
            ← Back
          </button>
          <MaintenanceStatusPill status={status} />
        </div>
        <button
          onClick={() => setConfirmingDelete(true)}
          className="btn-secondary text-red-700"
          disabled={deleting}
        >
          Delete
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input
            id="title"
            className="input-field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select
              id="status"
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {error && <div className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>}

        <div className="flex justify-end">
          <button onClick={handleSave} className="btn-primary" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-forest-dark text-lg">Linked items ({linkedItems.length})</h2>
          <button onClick={() => setOpenPicker('items')} className="btn-secondary text-sm">
            + Add items
          </button>
        </div>
        {linkedItems.length === 0 ? (
          <div className="text-sm text-gray-600">No items linked yet.</div>
        ) : (
          <ul className="divide-y divide-sage-light">
            {linkedItems.map((it) => (
              <li key={it.item_id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={!!it.completed_at}
                  onChange={(e) => toggleItem(it.item_id, e.target.checked)}
                  aria-label={`Mark ${it.name} complete`}
                />
                <span className="flex-1 text-sm">
                  {it.name}
                  {it.type_name && <span className="text-gray-500"> · {it.type_name}</span>}
                </span>
                <button
                  onClick={() => removeItem(it.item_id)}
                  className="text-xs text-gray-500 hover:text-red-700"
                  aria-label={`Remove ${it.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-forest-dark text-lg">Linked articles ({linkedKnowledge.length})</h2>
          <button onClick={() => setOpenPicker('knowledge')} className="btn-secondary text-sm">
            + Add articles
          </button>
        </div>
        {linkedKnowledge.length === 0 ? (
          <div className="text-sm text-gray-600">No articles linked yet.</div>
        ) : (
          <ul className="divide-y divide-sage-light">
            {linkedKnowledge.map((k) => (
              <li key={k.knowledge_item_id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm">
                  {k.title}
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 ml-2">{k.visibility}</span>
                </span>
                <button
                  onClick={() => removeKnowledge(k.knowledge_item_id)}
                  className="text-xs text-gray-500 hover:text-red-700"
                  aria-label={`Remove ${k.title}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openPicker === 'items' && project.property_id && (
        <MaintenanceItemPickerInterim
          projectId={project.id}
          propertyId={project.property_id}
          alreadyLinkedIds={linkedItems.map((i) => i.item_id)}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === 'knowledge' && (
        <MaintenanceKnowledgePickerInterim
          projectId={project.id}
          orgId={project.org_id}
          alreadyLinkedIds={linkedKnowledge.map((k) => k.knowledge_item_id)}
          onClose={() => setOpenPicker(null)}
        />
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="card max-w-sm w-full p-5">
            <h3 className="font-heading text-forest-dark text-lg mb-2">Delete project?</h3>
            <p className="text-sm text-gray-600 mb-4">This cannot be undone. Linked items and knowledge will be unlinked.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="btn-secondary"
                disabled={deleting}
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-primary"
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
