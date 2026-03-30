'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { MapContainer, TileLayer } from 'react-leaflet';
import { parseGeoFile, validateGeoJSON } from '@/lib/geo/parsers';
import type { ParsedGeoLayer, GeoValidationResult } from '@/lib/geo/types';
import LayerStylePicker from './LayerStylePicker';
import GeoLayerRenderer from './GeoLayerRenderer';
import 'leaflet/dist/leaflet.css';

type ImportStep = 'upload' | 'preview' | 'confirm';

interface ImportFlowProps {
  orgId: string;
  properties: Array<{ id: string; name: string }>;
  onImport: (data: {
    name: string;
    description: string;
    color: string;
    opacity: number;
    geojson: GeoJSON.FeatureCollection;
    sourceFormat: string;
    sourceFilename: string;
    featureCount: number;
    bbox: [number, number, number, number];
    isPropertyBoundary: boolean;
    assignedPropertyIds: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

const ACCEPT = {
  'application/geo+json': ['.geojson'],
  'application/json': ['.json'],
  'application/vnd.google-earth.kml+xml': ['.kml'],
  'application/vnd.google-earth.kmz': ['.kmz'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

export default function ImportFlow({ orgId, properties, onImport, onCancel }: ImportFlowProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<GeoValidationResult | null>(null);
  const [parsed, setParsed] = useState<ParsedGeoLayer | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [opacity, setOpacity] = useState(0.6);
  const [isPropertyBoundary, setIsPropertyBoundary] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setParsing(true);
    setParseError(null);

    try {
      const result = await parseGeoFile(file);
      const validationResult = validateGeoJSON(result.geojson);
      if (!validationResult.valid) {
        setParseError(validationResult.errors.join('; '));
        setParsing(false);
        return;
      }
      setParsed(result);
      setValidation(validationResult);
      setName(result.name);
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onImport({
        name,
        description,
        color,
        opacity,
        geojson: parsed.geojson,
        sourceFormat: parsed.sourceFormat,
        sourceFilename: parsed.sourceFilename,
        featureCount: parsed.featureCount,
        bbox: parsed.bbox,
        isPropertyBoundary,
        assignedPropertyIds: Array.from(selectedPropertyIds),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  // Upload Step
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Import Geo Layer</h2>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-600 mb-2">
            {isDragActive ? 'Drop file here' : 'Drop a file here or tap to browse'}
          </p>
          <p className="text-sm text-gray-400">.geojson, .json, .kml, .kmz, .zip (shapefile)</p>
          <p className="text-xs text-gray-400 mt-2">Max 50MB</p>
        </div>
        {parsing && <p className="text-sm text-blue-600">Parsing file...</p>}
        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        <div className="flex justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </div>
    );
  }

  // Preview Step
  if (step === 'preview' && parsed) {
    const center: [number, number] = [
      (parsed.bbox[1] + parsed.bbox[3]) / 2,
      (parsed.bbox[0] + parsed.bbox[2]) / 2,
    ];

    const sampleFeature = parsed.geojson.features[0];
    const sampleProps = sampleFeature?.properties ?? {};
    const attrKeys = Object.keys(sampleProps).slice(0, 6);

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Preview & Configure</h2>

        <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
          <MapContainer center={center} zoom={10} className="w-full h-full" zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <GeoLayerRenderer
              geojson={parsed.geojson}
              layer={{ id: 'preview', name, color, opacity, feature_count: parsed.featureCount } as any}
            />
          </MapContainer>
        </div>

        <div className="text-sm text-gray-500">
          {parsed.featureCount} {parsed.geometryTypes.join(', ')} features from {parsed.sourceFilename}
        </div>

        {validation?.warnings.map((w, i) => (
          <p key={i} className="text-sm text-amber-600">{w}</p>
        ))}

        <div>
          <label className="label">Layer Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>

        <div>
          <label className="label">Description (optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" />
        </div>

        <LayerStylePicker color={color} opacity={opacity} onColorChange={setColor} onOpacityChange={setOpacity} />

        {attrKeys.length > 0 && (
          <div>
            <label className="label">Attributes (sample)</label>
            <div className="overflow-x-auto mt-1">
              <table className="text-sm w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    {attrKeys.map((k) => (
                      <th key={k} className="text-left px-2 py-1 text-gray-500 font-medium">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.geojson.features.slice(0, 3).map((f, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {attrKeys.map((k) => (
                        <td key={k} className="px-2 py-1 text-gray-700">{String(f.properties?.[k] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button onClick={() => setStep('upload')} className="btn-secondary">Back</button>
          <button onClick={() => setStep('confirm')} className="btn-primary" disabled={!name.trim()}>Next</button>
        </div>
      </div>
    );
  }

  // Confirm Step
  if (step === 'confirm' && parsed) {
    const hasPolygons = parsed.geometryTypes.some((t) => t.includes('Polygon'));

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Confirm & Assign</h2>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-sm text-gray-500">
                {parsed.featureCount} {parsed.geometryTypes.join(', ')} features from {parsed.sourceFilename}
              </div>
            </div>
          </div>
        </div>

        {properties.length > 0 && (
          <div>
            <label className="label">Assign to Properties (optional)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {properties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProperty(p.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selectedPropertyIds.has(p.id)
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {selectedPropertyIds.has(p.id) && '✓ '}{p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasPolygons && selectedPropertyIds.size > 0 && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPropertyBoundary}
              onChange={(e) => setIsPropertyBoundary(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">Use as property boundary for assigned properties</span>
          </label>
        )}

        <div className="flex justify-between">
          <button onClick={() => setStep('preview')} className="btn-secondary">Back</button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? 'Importing...' : 'Import Layer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
