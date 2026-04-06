import type { FieldMap } from './types';

export interface FieldMatchResult {
  field_map: FieldMap;
  confidence: 'high' | 'medium' | 'low';
  matched_count: number;
}

interface PatternEntry {
  canonical: keyof FieldMap;
  exact: string[];
  prefix: string[];
}

const PATTERNS: PatternEntry[] = [
  {
    canonical: 'parcel_id',
    exact: ['APN', 'PIN', 'PARCEL_ID', 'PARCEL_NO', 'PARCEL_NUM', 'ACCT_ID', 'RP_ACCT_ID', 'TAX_ID', 'TAXLOT_ID', 'PARCELID', 'PARCEL_NUMBER'],
    prefix: ['PARCEL', 'TAX_PARCEL'],
  },
  {
    canonical: 'owner_name',
    exact: ['OWNER', 'OWNER_NAME', 'OWN_NAME', 'CONTACT_NAME', 'TAXPAYER', 'TAXPAYER_NAME', 'OWNERNAME'],
    prefix: ['OWNER', 'OWN_'],
  },
  {
    canonical: 'site_address',
    exact: ['SITE_ADDR', 'SITEADDRESS', 'SITE_ADDRESS', 'PROP_ADDR', 'ADDRESS', 'FULL_ADDR', 'FULL_ADDRESS', 'PROPADDR'],
    prefix: ['SITE_ADDR', 'PROP_ADDR', 'FULL_ADDR'],
  },
  {
    canonical: 'house_number',
    exact: ['HOUSE_NO', 'HOUSE_NUM', 'ADDR_NUM', 'STREET_NO', 'HOUSE_NUMBER', 'ADDNO', 'ADDR_NO'],
    prefix: ['HOUSE_N', 'ADDR_N'],
  },
  {
    canonical: 'street_name',
    exact: ['STREET_NAME', 'STREET', 'STREET_NM', 'ST_NAME', 'STREETNAME'],
    prefix: ['STREET_N', 'ST_NAME'],
  },
  {
    canonical: 'acres',
    exact: ['ACRES', 'POLY_ACRES', 'GIS_ACRES', 'AREA_ACRES', 'CALC_ACRES', 'ACREAGE', 'TOTAL_ACRES'],
    prefix: [],
  },
];

export function matchFields(fields: string[]): FieldMatchResult | null {
  const fieldMap: Partial<FieldMap> = {};
  const usedFields = new Set<string>();

  for (const pattern of PATTERNS) {
    const match = findBestMatch(fields, pattern, usedFields);
    if (match) {
      fieldMap[pattern.canonical] = match;
      usedFields.add(match.toUpperCase());
    }
  }

  if (!fieldMap.parcel_id) return null;

  const otherMatches = Object.keys(fieldMap).filter((k) => k !== 'parcel_id').length;

  let confidence: 'high' | 'medium' | 'low';
  if (otherMatches >= 2) {
    confidence = 'high';
  } else if (otherMatches === 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    field_map: { parcel_id: fieldMap.parcel_id, ...fieldMap } as FieldMap,
    confidence,
    matched_count: otherMatches + 1,
  };
}

function findBestMatch(
  fields: string[],
  pattern: PatternEntry,
  usedFields: Set<string>
): string | null {
  for (const exact of pattern.exact) {
    const found = fields.find(
      (f) => f.toUpperCase() === exact.toUpperCase() && !usedFields.has(f.toUpperCase())
    );
    if (found) return found;
  }

  for (const prefix of pattern.prefix) {
    const found = fields.find(
      (f) => f.toUpperCase().startsWith(prefix.toUpperCase()) && !usedFields.has(f.toUpperCase())
    );
    if (found) return found;
  }

  return null;
}
