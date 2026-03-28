'use client';

import { useState, useEffect, useCallback } from 'react';
import PlatformNav from '@/components/platform/PlatformNav';
import { createClient } from '@/lib/supabase/client';
import { onboardCreateOrg, generateEntityTypeSuggestions } from './actions';
import type { EntityTypeSuggestion } from './actions';
import { THEME_PRESETS } from '@/lib/config/themes';
import FileDropZone from '@/components/ai-context/FileDropZone';
import ProcessingProgress from '@/components/ai-context/ProcessingProgress';
import { parseFileForAnalysis } from '@/lib/ai-context/parsers';
import { analyzeFilesForOnboarding } from '@/lib/ai-context/actions';
import type { ParsedFileData } from '@/lib/ai-context/types';

type OnboardPath = 'ai' | 'manual';
type Step =
  | 'welcome'
  | 'ai-upload'
  | 'ai-progress'
  | 'ai-review'
  | 'name'
  | 'theme'
  | 'custommap'
  | 'items'
  | 'entities'
  | 'about'
  | 'review';

const AI_STEPS: Step[] = ['welcome', 'ai-upload', 'ai-progress', 'ai-review'];
const MANUAL_STEPS: Step[] = [
  'welcome',
  'name',
  'theme',
  'custommap',
  'items',
  'entities',
  'about',
  'review',
];

interface ItemTypeEntry {
  name: string;
  icon: string;
  color: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function OnboardPage() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Path selection
  const [onboardPath, setOnboardPath] = useState<OnboardPath | null>(null);

  // Form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [tagline, setTagline] = useState('');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState(64.8378);
  const [lng, setLng] = useState(-147.7164);
  const [zoom, setZoom] = useState(13);
  const [themePreset, setThemePreset] = useState('forest');
  const [itemTypes, setItemTypes] = useState<ItemTypeEntry[]>([
    { name: 'Bird Box', icon: '\u{1F3E0}', color: '#5D7F3A' },
  ]);
  const [aboutContent, setAboutContent] = useState(
    '# About\n\nDescribe your project here.'
  );
  const [entityTypeSuggestions, setEntityTypeSuggestions] = useState<
    EntityTypeSuggestion[]
  >([]);
  const [entityPrompt, setEntityPrompt] = useState('');
  const [generatingEntities, setGeneratingEntities] = useState(false);

  // AI path state
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiProcessingItems, setAiProcessingItems] = useState<
    Array<{
      id: string;
      fileName: string;
      mimeType: string;
      status: 'pending' | 'processing' | 'complete' | 'error';
      contentSummary: string | null;
      geoCount: number;
    }>
  >([]);
  const [aiOrgProfile, setAiOrgProfile] = useState<string | null>(null);
  const [aiSummaryReady, setAiSummaryReady] = useState(false);
  const [preFillApplied, setPreFillApplied] = useState(false);

  // Collapsible sections for ai-review
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    nameLocation: true,
    theme: true,
    itemTypes: true,
    entityTypes: true,
    about: true,
  });

  // Guard: redirect if user already has an org
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('org_memberships')
        .select('orgs(slug)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data?.orgs) {
            window.location.href = '/';
          } else {
            setReady(true);
          }
        });
    });
  }, []);

  const steps = onboardPath === 'ai' ? AI_STEPS : MANUAL_STEPS;
  const stepIndex = steps.indexOf(step);
  const isLast = stepIndex === steps.length - 1;

  function next() {
    if (stepIndex < steps.length - 1) {
      setError('');
      setStep(steps[stepIndex + 1]);
    }
  }

  function back() {
    if (stepIndex > 0) {
      setError('');
      setStep(steps[stepIndex - 1]);
    }
  }

  function validateCurrentStep(): boolean {
    switch (step) {
      case 'name':
        if (!orgName.trim()) {
          setError('Organization name is required.');
          return false;
        }
        if (!orgSlug.trim()) {
          setError('URL slug is required.');
          return false;
        }
        return true;
      case 'items':
        if (itemTypes.length === 0 || !itemTypes[0].name.trim()) {
          setError('At least one item type is required.');
          return false;
        }
        return true;
      case 'ai-review':
        if (!orgName.trim()) {
          setError('Organization name is required.');
          return false;
        }
        if (!orgSlug.trim()) {
          setError('URL slug is required.');
          return false;
        }
        if (itemTypes.length === 0 || !itemTypes[0].name.trim()) {
          setError('At least one item type is required.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (validateCurrentStep()) {
      next();
    }
  }

  function handleOrgNameChange(name: string) {
    setOrgName(name);
    if (!slugManuallyEdited) {
      setOrgSlug(toSlug(name));
    }
  }

  // AI analysis flow
  const runAiAnalysis = useCallback(async () => {
    if (aiFiles.length === 0) return;

    // Initialize processing items
    const items = aiFiles.map((file, i) => ({
      id: `onboard-${i}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      status: 'pending' as const,
      contentSummary: null,
      geoCount: 0,
    }));
    setAiProcessingItems(items);
    setAiSummaryReady(false);
    setAiOrgProfile(null);

    // Parse all files client-side first
    const parsedFiles: ParsedFileData[] = [];
    for (let i = 0; i < aiFiles.length; i++) {
      setAiProcessingItems((prev) =>
        prev.map((item, j) =>
          j === i ? { ...item, status: 'processing' } : item
        )
      );

      try {
        const parsed = await parseFileForAnalysis(aiFiles[i]);
        parsedFiles.push(parsed);

        setAiProcessingItems((prev) =>
          prev.map((item, j) =>
            j === i
              ? {
                  ...item,
                  status: 'complete',
                  contentSummary: 'Parsed successfully',
                  geoCount: parsed.geoFeatures?.length ?? 0,
                }
              : item
          )
        );
      } catch {
        parsedFiles.push({
          fileName: aiFiles[i].name,
          mimeType: aiFiles[i].type || 'application/octet-stream',
          fileSize: aiFiles[i].size,
          sourceType: 'file',
          textContent: '(parse error)',
        });

        setAiProcessingItems((prev) =>
          prev.map((item, j) =>
            j === i ? { ...item, status: 'error' } : item
          )
        );
      }
    }

    // Now show "analyzing with AI" state
    setAiProcessingItems((prev) =>
      prev.map((item) =>
        item.status === 'complete'
          ? { ...item, status: 'processing', contentSummary: 'Analyzing...' }
          : item
      )
    );

    // Send all parsed files to the server for AI analysis
    const result = await analyzeFilesForOnboarding(parsedFiles);

    if ('error' in result) {
      setError(result.error);
      setAiProcessingItems((prev) =>
        prev.map((item) =>
          item.status === 'processing'
            ? { ...item, status: 'error', contentSummary: 'Analysis failed' }
            : item
        )
      );
      return;
    }

    // Update processing items with AI summaries
    setAiProcessingItems((prev) =>
      prev.map((item) => {
        const summary = result.fileSummaries.find(
          (fs) => fs.fileName === item.fileName
        );
        return {
          ...item,
          status: 'complete',
          contentSummary: summary?.summary ?? item.contentSummary,
        };
      })
    );

    setAiOrgProfile(result.orgProfile);
    setAiSummaryReady(true);

    // Apply pre-fill values
    const pf = result.preFill;
    if (pf.orgName) {
      setOrgName(pf.orgName);
      setOrgSlug(toSlug(pf.orgName));
    }
    if (pf.tagline) setTagline(pf.tagline);
    if (pf.locationName) setLocationName(pf.locationName);
    if (pf.lat != null) setLat(pf.lat);
    if (pf.lng != null) setLng(pf.lng);
    if (pf.zoom != null) setZoom(pf.zoom);
    if (pf.themePreset) setThemePreset(pf.themePreset);
    if (pf.itemTypes && pf.itemTypes.length > 0) setItemTypes(pf.itemTypes);
    if (pf.entityTypes && pf.entityTypes.length > 0)
      setEntityTypeSuggestions(pf.entityTypes);
    if (pf.aboutContent) setAboutContent(pf.aboutContent);
    setPreFillApplied(true);

    // Auto-advance to review after a brief delay
    setTimeout(() => {
      setStep('ai-review');
    }, 1500);
  }, [aiFiles]);

  async function handleLaunch() {
    if (!validateCurrentStep()) return;

    setSaving(true);
    setError('');

    try {
      const result = await onboardCreateOrg({
        orgName,
        orgSlug,
        tagline,
        locationName,
        lat,
        lng,
        zoom,
        themePreset,
        itemTypes: itemTypes.filter((t) => t.name.trim()),
        aboutContent,
        entityTypes:
          entityTypeSuggestions.length > 0 ? entityTypeSuggestions : undefined,
      });

      if ('error' in result) {
        throw new Error(result.error);
      }

      const platformDomain =
        process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || window.location.hostname;
      window.location.href = `https://${result.orgSlug}.${platformDomain}/admin`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
      setSaving(false);
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-white">
        <PlatformNav minimal />
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PlatformNav minimal />

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Progress indicator */}
        {step !== 'welcome' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                Step {stepIndex} of {steps.length - 1}
              </span>
              <span className="text-xs text-gray-500 capitalize">
                {step.replace('ai-', 'AI ')}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{
                  width: `${(stepIndex / (steps.length - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content card */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-8">
          {step === 'welcome' && (
            <div className="text-center py-8">
              <span className="text-5xl mb-4 block">{'\u{1F30D}'}</span>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                Let&apos;s set up your organization
              </h1>
              <p className="text-gray-500 max-w-md mx-auto mb-8">
                We&apos;ll walk you through naming your org, choosing a theme,
                configuring item types, and launching your mapping project.
              </p>
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => {
                    setOnboardPath('ai');
                    setError('');
                    setStep('ai-upload');
                  }}
                  className="rounded-lg bg-indigo-600 px-8 py-3 text-lg font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors w-full max-w-sm"
                >
                  Upload context to get started fast
                </button>
                <button
                  onClick={() => {
                    setOnboardPath('manual');
                    setError('');
                    setStep('name');
                  }}
                  className="rounded-lg border border-gray-300 px-8 py-3 text-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors w-full max-w-sm"
                >
                  Set up manually
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-6 max-w-sm mx-auto">
                Your files are analyzed securely and never shared. They help us
                pre-fill your setup so you can launch faster.
              </p>
            </div>
          )}

          {step === 'ai-upload' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Upload Your Context
              </h2>
              <p className="text-sm text-gray-500">
                Upload documents, spreadsheets, maps, or images about your
                project. We&apos;ll analyze them to pre-fill your setup.
              </p>

              <FileDropZone
                onFilesSelected={(files) => setAiFiles(files)}
                disabled={false}
              />

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-gray-400">
                  Files are analyzed privately and not stored until you launch.
                </p>
              </div>

              {aiFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStep('ai-progress');
                    // Start analysis after transitioning
                    setTimeout(() => runAiAnalysis(), 100);
                  }}
                  className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors w-full"
                >
                  Analyze {aiFiles.length}{' '}
                  {aiFiles.length === 1 ? 'file' : 'files'}
                </button>
              )}
            </div>
          )}

          {step === 'ai-progress' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Analyzing Your Files
              </h2>
              <p className="text-sm text-gray-500">
                We&apos;re reading through your uploads and building a profile
                for your organization.
              </p>

              <ProcessingProgress
                items={aiProcessingItems}
                summaryReady={aiSummaryReady}
                orgProfile={aiOrgProfile}
              />

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    AI analysis failed
                  </p>
                  <p className="text-sm text-red-600">{error}</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setStep('ai-upload');
                      }}
                      className="text-sm font-medium text-red-700 hover:text-red-800 transition-colors"
                    >
                      &larr; Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setOnboardPath('manual');
                        setStep('name');
                      }}
                      className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Set up manually instead
                    </button>
                  </div>
                </div>
              )}

              {aiSummaryReady && preFillApplied && (
                <p className="text-sm text-green-600 font-medium text-center">
                  Setup suggestions ready — moving to review...
                </p>
              )}
            </div>
          )}

          {step === 'ai-review' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Review &amp; Edit
              </h2>
              <p className="text-sm text-gray-500">
                We&apos;ve pre-filled your setup based on the uploaded files.
                Review each section and edit as needed, then launch.
              </p>

              {/* Name & Location section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('nameLocation')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    Name &amp; Location
                  </span>
                  <span className="text-gray-400 text-xs">
                    {expandedSections.nameLocation ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {expandedSections.nameLocation && (
                  <div className="p-4 space-y-4">
                    <div>
                      <label
                        htmlFor="ai-review-name"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Organization Name *
                      </label>
                      <input
                        id="ai-review-name"
                        type="text"
                        value={orgName}
                        onChange={(e) => handleOrgNameChange(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., Fairbanks Bird Watchers"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ai-review-slug"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        URL Slug *
                      </label>
                      <input
                        id="ai-review-slug"
                        type="text"
                        value={orgSlug}
                        onChange={(e) => {
                          setOrgSlug(toSlug(e.target.value));
                          setSlugManuallyEdited(true);
                        }}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="fairbanks-bird-watchers"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Your site:{' '}
                        <span className="font-medium text-indigo-600">
                          {orgSlug || 'slug'}
                        </span>
                        .fieldmapper.org
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="ai-review-tagline"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Tagline
                      </label>
                      <input
                        id="ai-review-tagline"
                        type="text"
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., Monitoring nest boxes since 2020"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ai-review-location"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Location Name
                      </label>
                      <input
                        id="ai-review-location"
                        type="text"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., Fairbanks, AK"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label
                          htmlFor="ai-review-lat"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Latitude
                        </label>
                        <input
                          id="ai-review-lat"
                          type="number"
                          step="any"
                          value={lat}
                          onChange={(e) => setLat(Number(e.target.value))}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ai-review-lng"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Longitude
                        </label>
                        <input
                          id="ai-review-lng"
                          type="number"
                          step="any"
                          value={lng}
                          onChange={(e) => setLng(Number(e.target.value))}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ai-review-zoom"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Zoom
                        </label>
                        <input
                          id="ai-review-zoom"
                          type="number"
                          min="1"
                          max="20"
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Theme section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('theme')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    Theme
                  </span>
                  <span className="text-gray-400 text-xs">
                    {expandedSections.theme ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {expandedSections.theme && (
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(THEME_PRESETS).map(([key, theme]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setThemePreset(key)}
                          className={`p-4 rounded-lg border-2 transition-all text-left ${
                            themePreset === key
                              ? 'border-indigo-600 ring-2 ring-indigo-100'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex gap-1.5 mb-3">
                            {Object.values(theme.colors)
                              .slice(0, 4)
                              .map((color, i) => (
                                <div
                                  key={i}
                                  className="w-8 h-8 rounded-full border border-white shadow-sm"
                                  style={{ backgroundColor: color as string }}
                                />
                              ))}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {theme.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Item Types section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('itemTypes')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    Item Types
                  </span>
                  <span className="text-gray-400 text-xs">
                    {expandedSections.itemTypes ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {expandedSections.itemTypes && (
                  <div className="p-4 space-y-4">
                    {itemTypes.map((type, i) => (
                      <div
                        key={i}
                        className="flex gap-3 items-start p-4 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={type.name}
                            onChange={(e) => {
                              const updated = [...itemTypes];
                              updated[i] = {
                                ...updated[i],
                                name: e.target.value,
                              };
                              setItemTypes(updated);
                            }}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            placeholder="Type name (e.g., Bird Box)"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={type.icon}
                              onChange={(e) => {
                                const updated = [...itemTypes];
                                updated[i] = {
                                  ...updated[i],
                                  icon: e.target.value,
                                };
                                setItemTypes(updated);
                              }}
                              className="w-20 text-center text-lg rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                              placeholder={'\u{1F3E0}'}
                              maxLength={4}
                            />
                            <input
                              type="color"
                              value={type.color}
                              onChange={(e) => {
                                const updated = [...itemTypes];
                                updated[i] = {
                                  ...updated[i],
                                  color: e.target.value,
                                };
                                setItemTypes(updated);
                              }}
                              className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                            />
                          </div>
                        </div>
                        {itemTypes.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setItemTypes(
                                itemTypes.filter((_, j) => j !== i)
                              )
                            }
                            className="text-red-500 hover:text-red-700 text-sm mt-2"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setItemTypes([
                          ...itemTypes,
                          { name: '', icon: '\u{1F4CD}', color: '#5D7F3A' },
                        ])
                      }
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                    >
                      + Add Another Type
                    </button>
                  </div>
                )}
              </div>

              {/* Entity Types section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('entityTypes')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    Entity Types
                    {entityTypeSuggestions.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        ({entityTypeSuggestions.length})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {expandedSections.entityTypes ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {expandedSections.entityTypes && (
                  <div className="p-4 space-y-4">
                    {entityTypeSuggestions.length > 0 ? (
                      entityTypeSuggestions.map((et, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{et.icon}</span>
                              <span className="font-medium text-gray-900">
                                {et.name}
                              </span>
                              <span
                                className="inline-block w-4 h-4 rounded-full border border-gray-200"
                                style={{ backgroundColor: et.color }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setEntityTypeSuggestions(
                                  entityTypeSuggestions.filter(
                                    (_, j) => j !== i
                                  )
                                )
                              }
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                          {et.link_to.length > 0 && (
                            <p className="text-xs text-gray-500">
                              Links to: {et.link_to.join(', ')}
                            </p>
                          )}
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Fields:</span>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                              {et.fields.map((f, fi) => (
                                <li key={fi}>
                                  {f.name}{' '}
                                  <span className="text-gray-400">
                                    ({f.field_type}
                                    {f.required ? ', required' : ''})
                                  </span>
                                  {f.options && f.options.length > 0 && (
                                    <span className="text-gray-400">
                                      {' '}
                                      [{f.options.join(', ')}]
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">
                        No entity types suggested. You can add them later in
                        settings.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* About section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('about')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    About Page
                  </span>
                  <span className="text-gray-400 text-xs">
                    {expandedSections.about ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {expandedSections.about && (
                  <div className="p-4">
                    <textarea
                      value={aboutContent}
                      onChange={(e) => setAboutContent(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-h-[150px] font-mono"
                      placeholder="# About&#10;&#10;Describe your project here..."
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'name' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Name &amp; Location
              </h2>
              <div>
                <label
                  htmlFor="onboard-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Organization Name *
                </label>
                <input
                  id="onboard-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Fairbanks Bird Watchers"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-slug"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  URL Slug *
                </label>
                <input
                  id="onboard-slug"
                  type="text"
                  value={orgSlug}
                  onChange={(e) => {
                    setOrgSlug(toSlug(e.target.value));
                    setSlugManuallyEdited(true);
                  }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="fairbanks-bird-watchers"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Your site:{' '}
                  <span className="font-medium text-indigo-600">
                    {orgSlug || 'slug'}
                  </span>
                  .fieldmapper.org
                </p>
              </div>
              <div>
                <label
                  htmlFor="onboard-tagline"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tagline
                </label>
                <input
                  id="onboard-tagline"
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Monitoring nest boxes since 2020"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-location"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Location Name
                </label>
                <input
                  id="onboard-location"
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Fairbanks, AK"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="onboard-lat"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Latitude
                  </label>
                  <input
                    id="onboard-lat"
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="onboard-lng"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Longitude
                  </label>
                  <input
                    id="onboard-lng"
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="onboard-zoom"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Zoom
                  </label>
                  <input
                    id="onboard-zoom"
                    type="number"
                    min="1"
                    max="20"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'theme' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Choose a Theme
              </h2>
              <p className="text-sm text-gray-500">
                Pick a color scheme for your site. You can customize colors
                later in settings.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(THEME_PRESETS).map(([key, theme]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setThemePreset(key)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      themePreset === key
                        ? 'border-indigo-600 ring-2 ring-indigo-100'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-3">
                      {Object.values(theme.colors)
                        .slice(0, 4)
                        .map((color, i) => (
                          <div
                            key={i}
                            className="w-8 h-8 rounded-full border border-white shadow-sm"
                            style={{ backgroundColor: color as string }}
                          />
                        ))}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'custommap' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Custom Map Overlay
              </h2>
              <p className="text-sm text-gray-500">
                You can upload a park map, trail map, or facility diagram to
                overlay on the base map. This can be configured later in your
                org settings.
              </p>
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                <span className="text-3xl block mb-3">
                  {'\u{1F5FA}\uFE0F'}
                </span>
                <p className="text-sm text-gray-500 mb-2">
                  Custom map overlay support coming soon.
                </p>
                <p className="text-xs text-gray-400">
                  Click Next to skip this step for now.
                </p>
              </div>
            </div>
          )}

          {step === 'items' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Item Types
              </h2>
              <p className="text-sm text-gray-500">
                What kinds of things will you track? Add at least one type. You
                can add more later in settings.
              </p>
              <div className="space-y-4">
                {itemTypes.map((type, i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-start p-4 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={type.name}
                        onChange={(e) => {
                          const updated = [...itemTypes];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setItemTypes(updated);
                        }}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="Type name (e.g., Bird Box)"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={type.icon}
                          onChange={(e) => {
                            const updated = [...itemTypes];
                            updated[i] = {
                              ...updated[i],
                              icon: e.target.value,
                            };
                            setItemTypes(updated);
                          }}
                          className="w-20 text-center text-lg rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          placeholder={'\u{1F3E0}'}
                          maxLength={4}
                        />
                        <input
                          type="color"
                          value={type.color}
                          onChange={(e) => {
                            const updated = [...itemTypes];
                            updated[i] = {
                              ...updated[i],
                              color: e.target.value,
                            };
                            setItemTypes(updated);
                          }}
                          className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                        />
                      </div>
                    </div>
                    {itemTypes.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setItemTypes(itemTypes.filter((_, j) => j !== i))
                        }
                        className="text-red-500 hover:text-red-700 text-sm mt-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setItemTypes([
                    ...itemTypes,
                    { name: '', icon: '\u{1F4CD}', color: '#5D7F3A' },
                  ])
                }
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                + Add Another Type
              </button>
            </div>
          )}

          {step === 'entities' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Entity Types
              </h2>
              <p className="text-sm text-gray-500">
                Entity types are non-spatial records (like species, volunteers,
                or equipment) that link to your items. Describe what you track
                and we&apos;ll suggest entity types with fields.
              </p>
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
                Your item types:{' '}
                {itemTypes
                  .filter((t) => t.name.trim())
                  .map((t) => `${t.icon} ${t.name}`)
                  .join(', ') || 'None'}
              </div>
              <div>
                <label
                  htmlFor="entity-prompt"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  What do you track?
                </label>
                <input
                  id="entity-prompt"
                  type="text"
                  value={entityPrompt}
                  onChange={(e) => setEntityPrompt(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="We track bird species that nest in our boxes, and the volunteers who maintain them"
                />
              </div>
              <button
                type="button"
                disabled={generatingEntities || !entityPrompt.trim()}
                onClick={async () => {
                  setGeneratingEntities(true);
                  setError('');
                  const result = await generateEntityTypeSuggestions({
                    orgName,
                    itemTypes: itemTypes
                      .filter((t) => t.name.trim())
                      .map((t) => t.name),
                    userPrompt: entityPrompt,
                  });
                  if ('error' in result) {
                    setError(result.error);
                  } else {
                    setEntityTypeSuggestions(result.suggestions);
                  }
                  setGeneratingEntities(false);
                }}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {generatingEntities ? 'Generating...' : 'Generate Suggestions'}
              </button>

              {entityTypeSuggestions.length > 0 && (
                <div className="space-y-4">
                  {entityTypeSuggestions.map((et, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{et.icon}</span>
                          <span className="font-medium text-gray-900">
                            {et.name}
                          </span>
                          <span
                            className="inline-block w-4 h-4 rounded-full border border-gray-200"
                            style={{ backgroundColor: et.color }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEntityTypeSuggestions(
                              entityTypeSuggestions.filter((_, j) => j !== i)
                            )
                          }
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                      {et.link_to.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Links to: {et.link_to.join(', ')}
                        </p>
                      )}
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Fields:</span>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                          {et.fields.map((f, fi) => (
                            <li key={fi}>
                              {f.name}{' '}
                              <span className="text-gray-400">
                                ({f.field_type}
                                {f.required ? ', required' : ''})
                              </span>
                              {f.options && f.options.length > 0 && (
                                <span className="text-gray-400">
                                  {' '}
                                  [{f.options.join(', ')}]
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={next}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Skip — I&apos;ll add entity types later
              </button>
            </div>
          )}

          {step === 'about' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                About Page
              </h2>
              <p className="text-sm text-gray-500">
                Write a description for your project. You can use Markdown
                formatting.
              </p>
              <textarea
                value={aboutContent}
                onChange={(e) => setAboutContent(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-h-[200px] font-mono"
                placeholder="# About&#10;&#10;Describe your project here..."
              />
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Review &amp; Launch
              </h2>
              <p className="text-sm text-gray-500">
                Here&apos;s a summary of your settings. Click Launch to go live!
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Organization</span>
                  <span className="text-gray-900 font-medium">
                    {orgName || '\u2014'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">URL</span>
                  <span className="text-indigo-600 font-medium">
                    {orgSlug || '\u2014'}.fieldmapper.org
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Tagline</span>
                  <span className="text-gray-900">{tagline || '\u2014'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Location</span>
                  <span className="text-gray-900">
                    {locationName || '\u2014'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Theme</span>
                  <span className="text-gray-900 capitalize">
                    {themePreset}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Item Types</span>
                  <span className="text-gray-900">
                    {itemTypes
                      .filter((t) => t.name.trim())
                      .map((t) => `${t.icon} ${t.name}`)
                      .join(', ') || '\u2014'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Entity Types</span>
                  <span className="text-gray-900">
                    {entityTypeSuggestions.length > 0
                      ? entityTypeSuggestions
                          .map((et) => `${et.icon} ${et.name}`)
                          .join(', ')
                      : '\u2014'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step !== 'welcome' && step !== 'ai-progress' && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Back
              </button>
              {isLast || step === 'ai-review' ? (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-8 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Setting up...' : 'Launch'}
                </button>
              ) : step === 'ai-upload' ? null : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
