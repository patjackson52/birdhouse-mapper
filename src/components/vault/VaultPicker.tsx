'use client';

import { useState } from 'react';
import VaultBrowseTab from './VaultBrowseTab';
import VaultUploadTab from './VaultUploadTab';
import type { VaultItem, VaultCategory, VaultVisibility } from '@/lib/vault/types';

interface VaultPickerProps {
  orgId: string;
  categoryFilter?: VaultCategory[];
  visibilityFilter?: VaultVisibility;
  multiple?: boolean;
  onSelect: (items: VaultItem[]) => void;
  onClose: () => void;
  propertyId?: string;
  defaultUploadCategory?: VaultCategory;
  defaultUploadVisibility?: VaultVisibility;
  defaultIsAiContext?: boolean;
}

type Tab = 'browse' | 'upload';

export default function VaultPicker({
  orgId,
  categoryFilter,
  visibilityFilter,
  multiple = false,
  onSelect,
  onClose,
  propertyId,
  defaultUploadCategory,
  defaultUploadVisibility,
  defaultIsAiContext,
}: VaultPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browse');

  function handleUploaded(item: VaultItem) {
    onSelect([item]);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-forest-dark">Select from Data Vault</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'browse'
                ? 'border-sage text-sage'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Browse Vault
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'upload'
                ? 'border-sage text-sage'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Upload New
          </button>
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto p-6">
          {activeTab === 'browse' ? (
            <VaultBrowseTab
              orgId={orgId}
              categoryFilter={categoryFilter}
              visibilityFilter={visibilityFilter}
              propertyId={propertyId}
              multiple={multiple}
              onSelect={onSelect}
            />
          ) : (
            <VaultUploadTab
              orgId={orgId}
              defaultCategory={defaultUploadCategory}
              defaultVisibility={defaultUploadVisibility}
              defaultIsAiContext={defaultIsAiContext}
              onUploaded={handleUploaded}
            />
          )}
        </div>
      </div>
    </div>
  );
}
