'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { LandingPageConfig, LandingBlock, LandingAsset } from '@/lib/config/landing-types';
import type { Data } from '@measured/puck';
import { getLandingPageConfig, saveLandingPageConfig, generateLandingPage } from '@/app/admin/landing/actions';
import HomepageToggle from '@/components/admin/landing/HomepageToggle';
import AssetManager from '@/components/admin/landing/AssetManager';
import GenerateSection from '@/components/admin/landing/GenerateSection';
import BlockList from '@/components/admin/landing/BlockList';
import { LandingRendererPreview } from '@/components/landing/LandingRendererPreview';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { puckConfig } from '@/lib/config/puck-config';

// Puck editor is dynamically imported — no Puck JS on public pages
const PuckEditorWrapper = dynamic(
  () => import('@/components/admin/landing/PuckEditorWrapper'),
  { ssr: false }
);

type EditorType = 'blocks' | 'puck';

export default function AdminLandingPage() {
  const [config, setConfig] = useState<LandingPageConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [blocks, setBlocks] = useState<LandingBlock[]>([]);
  const [assets, setAssets] = useState<LandingAsset[]>([]);
  const [referenceLinks, setReferenceLinks] = useState<{ label: string; url: string }[]>([]);
  const [prompt, setPrompt] = useState('');
  const [previousBlocks, setPreviousBlocks] = useState<LandingBlock[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeView, setActiveView] = useState<'editor' | 'preview'>('editor');
  const [isLoading, setIsLoading] = useState(true);
  const [assetsOpen, setAssetsOpen] = useState(false);

  // Puck state
  const [editorType, setEditorType] = useState<EditorType>('blocks');
  const [puckData, setPuckData] = useState<Data | undefined>(undefined);
  const [previousPuckData, setPreviousPuckData] = useState<Data | undefined>(undefined);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLandingPageConfig();
        if (data) {
          setConfig(data);
          setEnabled(data.enabled);
          setBlocks(data.blocks ?? []);
          setAssets(data.assets ?? []);
          if (data.generatedFrom) setPrompt(data.generatedFrom);
          if (data.editorType) setEditorType(data.editorType);
          if (data.puckData) setPuckData(data.puckData);
          if (data.puckGeneratedFrom) setPrompt(data.puckGeneratedFrom);
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to load landing page config.' });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleSwitchEditorType = useCallback((type: EditorType) => {
    if (type === editorType) return;
    setEditorType(type);
    setMessage({
      type: 'success',
      text: 'Switching will change which content is shown publicly. Save to apply.',
    });
  }, [editorType]);

  const handleGenerate = useCallback(async () => {
    if (editorType === 'blocks') {
      if (blocks.length > 0) {
        if (!window.confirm('This will replace all current blocks. Continue?')) return;
      }
      setPreviousBlocks(blocks);
    } else {
      if (puckData) {
        if (!window.confirm('This will replace the current visual layout. Continue?')) return;
      }
      setPreviousPuckData(puckData);
    }

    setIsGenerating(true);
    setMessage(null);

    const { blocks: newBlocks, puckData: newPuckData, error } = await generateLandingPage(
      prompt,
      assets,
      referenceLinks,
      editorType
    );

    if (error) {
      setMessage({ type: 'error', text: error ?? 'Generation failed.' });
      setPreviousBlocks(null);
      setPreviousPuckData(undefined);
      setIsGenerating(false);
      return;
    }

    if (editorType === 'puck' && newPuckData) {
      setPuckData(newPuckData);
    } else if (newBlocks) {
      setBlocks(newBlocks);
    }
    setIsGenerating(false);
  }, [editorType, blocks, puckData, prompt, assets, referenceLinks]);

  function handleUndo() {
    if (editorType === 'puck' && previousPuckData !== undefined) {
      setPuckData(previousPuckData);
      setPreviousPuckData(undefined);
    } else if (previousBlocks) {
      setBlocks(previousBlocks);
      setPreviousBlocks(null);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);

    const updated: LandingPageConfig = {
      enabled,
      blocks,
      assets,
      generatedFrom: editorType === 'blocks' ? (prompt || undefined) : config?.generatedFrom,
      editorType,
      puckData: puckData,
      puckGeneratedFrom: editorType === 'puck' ? (prompt || undefined) : config?.puckGeneratedFrom,
    };

    const { error } = await saveLandingPageConfig(updated);

    if (error) {
      setMessage({ type: 'error', text: error });
    } else {
      setConfig(updated);
      setMessage({ type: 'success', text: 'Saved successfully!' });
      setPreviousBlocks(null);
      setPreviousPuckData(undefined);
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const canUndo =
    (editorType === 'puck' && previousPuckData !== undefined) ||
    (editorType === 'blocks' && previousBlocks !== null);

  const editorPanel = (
    <div className="space-y-6 p-4">
      <h2 className="text-lg font-semibold text-gray-800">Landing Page Editor</h2>

      {message && (
        <div
          className={`text-sm rounded-lg px-4 py-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <HomepageToggle enabled={enabled} onChange={setEnabled} />

      {/* Editor type toggle */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Editor
        </label>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => handleSwitchEditorType('blocks')}
            className={`flex-1 py-2 font-medium transition-colors ${
              editorType === 'blocks'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Custom Blocks
          </button>
          <button
            type="button"
            onClick={() => handleSwitchEditorType('puck')}
            className={`flex-1 py-2 font-medium transition-colors ${
              editorType === 'puck'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Visual Editor
          </button>
        </div>
        {editorType === 'puck' && (
          <p className="text-xs text-gray-400 mt-1">
            Drag-and-drop Puck editor. AI generation creates Puck-format content.
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAssetsOpen(!assetsOpen)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
        >
          <span className={`transition-transform ${assetsOpen ? 'rotate-90' : ''}`}>&#9654;</span>
          Assets &amp; References
        </button>
        {assetsOpen && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <AssetManager
              assets={assets}
              onAssetsChange={setAssets}
              referenceLinks={referenceLinks}
              onReferenceLinksChange={setReferenceLinks}
            />
          </div>
        )}
      </div>

      <GenerateSection
        prompt={prompt}
        onPromptChange={setPrompt}
        hasBlocks={editorType === 'blocks' ? blocks.length > 0 : !!puckData}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
      />

      {canUndo && (
        <button
          type="button"
          onClick={handleUndo}
          className="w-full text-sm bg-yellow-50 text-yellow-800 border border-yellow-300 rounded-lg px-4 py-2 hover:bg-yellow-100 transition-colors"
        >
          Undo Regeneration
        </button>
      )}

      {editorType === 'blocks' && (
        <BlockList
          blocks={blocks}
          onBlocksChange={setBlocks}
          assets={assets}
          onAssetsChange={setAssets}
        />
      )}

      {editorType === 'puck' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
          <PuckEditorWrapper
            value={puckData}
            onChange={setPuckData}
            config={puckConfig}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full text-sm bg-green-600 text-white rounded-lg px-4 py-3 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {isSaving ? 'Saving...' : 'Save & Publish'}
      </button>
    </div>
  );

  const previewPanel = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Live Preview
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {editorType === 'blocks' ? (
          blocks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Add blocks to see a preview.
            </p>
          ) : (
            <LandingRendererPreview blocks={blocks} />
          )
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">
            Preview is shown inline in the Visual Editor.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full">
      {/* Mobile tab toggle */}
      <div className="md:hidden flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveView('editor')}
          className={`flex-1 text-sm py-2 font-medium transition-colors ${
            activeView === 'editor'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => setActiveView('preview')}
          className={`flex-1 text-sm py-2 font-medium transition-colors ${
            activeView === 'preview'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          Preview
        </button>
      </div>

      {/* Mobile: show one panel at a time */}
      <div className="md:hidden">
        {activeView === 'editor' ? (
          <div className="overflow-y-auto">{editorPanel}</div>
        ) : (
          <div className="overflow-y-auto">{previewPanel}</div>
        )}
      </div>

      {/* Desktop: side-by-side */}
      <div className="hidden md:flex h-full">
        <div className="w-[480px] shrink-0 border-r border-gray-200 overflow-y-auto">
          {editorPanel}
        </div>
        <div className="flex-1 overflow-y-auto">
          {previewPanel}
        </div>
      </div>
    </div>
  );
}
