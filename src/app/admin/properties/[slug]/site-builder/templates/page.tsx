'use client';

import { useState } from 'react';
import { templates } from '@/lib/puck/templates';
import { applyTemplate } from '@/app/admin/site-builder/actions';
import type { SiteTemplate } from '@/lib/puck/types';

export default function SiteBuilderTemplatesPage() {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const handleApply = async (template: SiteTemplate) => {
    if (!confirm(`Apply the "${template.name}" template? This will replace your current site builder content.`)) {
      return;
    }
    setApplying(template.id);
    const result = await applyTemplate(template.id, template.root, template.pages);
    if ('error' in result) {
      alert(`Failed to apply template: ${result.error}`);
    } else {
      setApplied(template.id);
    }
    setApplying(null);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">Site Templates</h2>
      <p className="mt-1 text-sm text-gray-600">
        Choose a template to get started. Templates set up your landing page, header, and footer.
        You can customize everything after applying.
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`rounded-xl border-2 p-6 transition ${
              applied === template.id
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-[var(--color-primary)] hover:shadow-md'
            }`}
          >
            <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
            <p className="mt-2 text-sm text-gray-600">{template.description}</p>
            <div className="mt-4">
              {applied === template.id ? (
                <span className="text-sm font-medium text-green-600">Applied!</span>
              ) : (
                <button
                  onClick={() => handleApply(template)}
                  disabled={applying !== null}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {applying === template.id ? 'Applying...' : 'Apply Template'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
