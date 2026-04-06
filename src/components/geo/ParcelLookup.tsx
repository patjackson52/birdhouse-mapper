'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { lookupParcel, confirmParcelSelection } from '@/app/admin/properties/[slug]/parcel-lookup/actions';
import type { ParcelCandidate, ParcelLookupResult } from '@/lib/geo/types';

const ParcelPreviewMap = dynamic(() => import('./ParcelPreviewMap'), { ssr: false });

type LookupState =
  | { step: 'idle' }
  | { step: 'searching'; address: string }
  | { step: 'found'; result: ParcelLookupResult }
  | { step: 'confirming' }
  | { step: 'confirmed'; geoLayerId: string; parcelCount: number; totalAcres: number }
  | { step: 'error'; message: string };

interface ParcelLookupProps {
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  orgId: string;
}

export default function ParcelLookup({ propertyId, propertyName, propertySlug, orgId }: ParcelLookupProps) {
  const pathname = usePathname();
  // Derive admin base from current URL: "/p/slug/admin" or "/admin/properties/slug"
  const adminBase = useMemo(() => {
    const parcelIdx = pathname.indexOf('/parcel-lookup');
    return parcelIdx >= 0 ? pathname.slice(0, parcelIdx) : pathname;
  }, [pathname]);

  const [state, setState] = useState<LookupState>({ step: 'idle' });
  const [address, setAddress] = useState('');
  const [selectedApns, setSelectedApns] = useState<Set<string>>(new Set());
  const [setAsBoundary, setSetAsBoundary] = useState(false);
  const [unionForBoundary, setUnionForBoundary] = useState(false);

  const handleLookup = useCallback(async () => {
    if (!address.trim()) return;
    setState({ step: 'searching', address });

    const result = await lookupParcel({ address, orgId, propertyId });

    if ('error' in result) {
      setState({ step: 'error', message: result.error });
      return;
    }

    if (result.status === 'not_found' || result.status === 'error') {
      setState({ step: 'error', message: result.error_message ?? 'No parcels found.' });
      return;
    }

    setSelectedApns(new Set(result.parcels.map((p) => p.apn)));
    setState({ step: 'found', result });
  }, [address, orgId, propertyId]);

  const handleToggleParcel = useCallback((apn: string) => {
    setSelectedApns((prev) => {
      const next = new Set(prev);
      if (next.has(apn)) {
        next.delete(apn);
      } else {
        next.add(apn);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (state.step !== 'found') return;

    const selected = state.result.parcels.filter((p) => selectedApns.has(p.apn));
    if (selected.length === 0) return;

    setState({ step: 'confirming' });

    const layerName = `${propertyName} Parcels`;
    const result = await confirmParcelSelection({
      parcels: selected,
      propertyId,
      orgId,
      setAsBoundary,
      unionForBoundary,
      layerName,
    });

    if ('error' in result) {
      setState({ step: 'error', message: result.error });
      return;
    }

    const totalAcres = selected.reduce((sum, p) => sum + (p.acres ?? 0), 0);
    setState({
      step: 'confirmed',
      geoLayerId: result.geoLayerId,
      parcelCount: selected.length,
      totalAcres,
    });
  }, [state, selectedApns, propertyId, propertyName, orgId, setAsBoundary, unionForBoundary]);

  const handleReset = useCallback(() => {
    setState({ step: 'idle' });
    setAddress('');
    setSelectedApns(new Set());
    setSetAsBoundary(false);
    setUnionForBoundary(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Idle */}
      {state.step === 'idle' && (
        <div className="card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Find Property Boundary</h3>
            <p className="text-sm text-gray-500">
              Look up parcel boundaries automatically from public GIS records
            </p>
          </div>
          <div>
            <label className="label">Property Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder="e.g. 7550 Fletcher Bay Rd NE, Bainbridge Island, WA"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <button
                className="btn-primary whitespace-nowrap"
                onClick={handleLookup}
                disabled={!address.trim()}
              >
                Look Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Searching */}
      {state.step === 'searching' && (
        <div className="card">
          <div className="flex items-center gap-3 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <div>
              <p className="font-medium">Searching county GIS records...</p>
              <p className="text-sm text-gray-500">Looking up parcels for: {state.address}</p>
            </div>
          </div>
        </div>
      )}

      {/* Found */}
      {state.step === 'found' && (
        <div className="card space-y-4">
          <div className="rounded-lg bg-green-50 p-3 border border-green-200">
            <p className="font-semibold text-green-700">
              {state.result.parcels.length === 1
                ? 'Parcel Found'
                : `Found ${state.result.parcels.length} parcels`}
            </p>
            {state.result.county_name && (
              <p className="text-sm text-gray-500">
                Source: {state.result.county_name} County ArcGIS
              </p>
            )}
          </div>

          <ParcelPreviewMap
            parcels={state.result.parcels}
            selectedApns={selectedApns}
            onToggleParcel={handleToggleParcel}
          />

          <div className="space-y-2">
            {state.result.parcels.map((p) => (
              <label
                key={p.apn}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedApns.has(p.apn)}
                  onChange={() => handleToggleParcel(p.apn)}
                />
                <div>
                  <span className="font-medium">APN {p.apn}</span>
                  {p.acres && <span className="text-gray-500"> · {p.acres} ac</span>}
                  {p.site_address && (
                    <span className="text-gray-500"> · {p.site_address}</span>
                  )}
                  {p.owner_of_record && (
                    <span className="text-gray-400 block text-xs">
                      Owner: {p.owner_of_record}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsBoundary}
                onChange={(e) => setSetAsBoundary(e.target.checked)}
              />
              Set as property boundary
            </label>
            {selectedApns.size > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unionForBoundary}
                  onChange={(e) => setUnionForBoundary(e.target.checked)}
                />
                Merge into unified boundary outline
              </label>
            )}
          </div>

          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={handleConfirm}
              disabled={selectedApns.size === 0}
            >
              Save Selected ({selectedApns.size})
            </button>
            <button className="btn-secondary" onClick={handleReset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirming */}
      {state.step === 'confirming' && (
        <div className="card">
          <div className="flex items-center gap-3 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="font-medium">Saving parcels as geo layer...</p>
          </div>
        </div>
      )}

      {/* Confirmed */}
      {state.step === 'confirmed' && (
        <div className="card text-center">
          <div className="rounded-lg bg-green-50 p-6 border border-green-200">
            <p className="text-2xl mb-2">&#10003;</p>
            <p className="font-semibold text-green-700">Boundary Saved</p>
            <p className="text-sm text-gray-500 mt-2">
              {state.parcelCount} parcel(s) · {state.totalAcres.toFixed(2)} acres
            </p>
          </div>
          <div className="flex gap-2 justify-center mt-4">
            <a href={`${adminBase}/geo-layers/discover`} className="btn-secondary text-sm">
              View in Geo Layers
            </a>
            <button className="btn-secondary text-sm" onClick={handleReset}>
              Look Up Another
            </button>
          </div>
        </div>
      )}

      {/* Error / Not Found */}
      {state.step === 'error' && (
        <div className="card space-y-4">
          <div className="rounded-lg bg-red-50 p-3 border border-red-200">
            <p className="font-semibold text-red-700">No parcels found</p>
            <p className="text-sm text-gray-500">{state.message}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Try another option:</p>
            <button className="btn-secondary w-full text-left text-sm" onClick={handleReset}>
              Try a different address
            </button>
            <a href={`${adminBase}/geo-layers/discover`} className="btn-secondary w-full text-left text-sm block">
              Draw boundary on map
            </a>
            <a href={`${adminBase}/geo-layers/discover`} className="btn-secondary w-full text-left text-sm block">
              Upload boundary file
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
