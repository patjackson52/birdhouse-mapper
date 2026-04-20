import { describe, it, expect } from 'vitest';
import {
  toEstablishmentMeans,
  toSpeciesResult,
  iucnCodeOf,
  type INatTaxonRaw,
} from '../inat-projection';

const base: INatTaxonRaw = {
  id: 12727,
  name: 'Sialia sialis',
  preferred_common_name: 'Eastern Bluebird',
  rank: 'species',
  observations_count: 42,
  wikipedia_url: null,
};

describe('toEstablishmentMeans', () => {
  it('returns "native" for iNat "native" string', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'native' } })).toBe('native');
  });
  it('returns "native" for iNat "endemic" string', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'endemic' } })).toBe('native');
  });
  it('returns "introduced" for iNat "introduced" string', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'introduced' } })).toBe('introduced');
  });
  it('returns "introduced" for iNat "invasive" string', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'invasive' } })).toBe('introduced');
  });
  it('returns "introduced" for British spelling "naturalised"', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'naturalised' } })).toBe('introduced');
  });
  it('returns "introduced" for American spelling "naturalized"', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'naturalized' } })).toBe('introduced');
  });
  it('returns null for unknown string', () => {
    expect(toEstablishmentMeans({ ...base, establishment_means: { establishment_means: 'something-weird' } })).toBe(null);
  });
  it('falls back to listed_taxa[0] when establishment_means is absent', () => {
    expect(toEstablishmentMeans({ ...base, listed_taxa: [{ establishment_means: 'native' }] })).toBe('native');
  });
  it('returns null when both sources are missing', () => {
    expect(toEstablishmentMeans(base)).toBe(null);
  });
});

describe('iucnCodeOf', () => {
  it('maps 10 → LC', () => {
    expect(iucnCodeOf({ ...base, conservation_status: { iucn: 10 } })).toBe('LC');
  });
  it('maps 40 → EN', () => {
    expect(iucnCodeOf({ ...base, conservation_status: { iucn: 40 } })).toBe('EN');
  });
  it('maps 0 → NE (Not Evaluated)', () => {
    expect(iucnCodeOf({ ...base, conservation_status: { iucn: 0 } })).toBe('NE');
  });
  it('maps 5 → DD (Data Deficient)', () => {
    expect(iucnCodeOf({ ...base, conservation_status: { iucn: 5 } })).toBe('DD');
  });
  it('returns null for an unknown numeric code', () => {
    expect(iucnCodeOf({ ...base, conservation_status: { iucn: 999 } })).toBe(null);
  });
  it('returns null when conservation_status is absent', () => {
    expect(iucnCodeOf(base)).toBe(null);
  });
});

describe('toSpeciesResult', () => {
  it('projects a full SpeciesResult with all enrichment fields', () => {
    const raw: INatTaxonRaw = {
      ...base,
      default_photo: { square_url: 'sq.jpg', medium_url: 'md.jpg' },
      conservation_status: { iucn: 40 },
      establishment_means: { establishment_means: 'endemic' },
    };
    const projected = toSpeciesResult(raw);
    expect(projected).toMatchObject({
      id: 12727,
      name: 'Sialia sialis',
      common_name: 'Eastern Bluebird',
      photo_url: 'md.jpg',
      photo_square_url: 'sq.jpg',
      rank: 'species',
      observations_count: 42,
      wikipedia_url: null,
      establishment_means: 'native',
      iucn_code: 'EN',
    });
  });

  it('falls back on missing optional fields', () => {
    const projected = toSpeciesResult({ id: 1, name: 'X' });
    expect(projected).toMatchObject({
      id: 1,
      name: 'X',
      common_name: 'X',
      photo_url: null,
      photo_square_url: null,
      rank: 'unknown',
      observations_count: 0,
      wikipedia_url: null,
      establishment_means: null,
      iucn_code: null,
    });
  });
});
