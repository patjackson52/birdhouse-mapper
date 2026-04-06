import { describe, it, expect } from 'vitest';
import { matchFields, type FieldMatchResult } from '@/lib/geo/field-matcher';

describe('matchFields', () => {
  it('matches Kitsap County field names', () => {
    const fields = [
      'OBJECTID', 'APN', 'RP_ACCT_ID', 'Shape__Area', 'Shape__Length',
      'CONTACT_NAME', 'SITE_ADDR', 'POLY_ACRES', 'ZONE_CODE',
    ];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('APN');
    expect(result!.field_map.owner_name).toBe('CONTACT_NAME');
    expect(result!.field_map.site_address).toBe('SITE_ADDR');
    expect(result!.field_map.acres).toBe('POLY_ACRES');
    expect(result!.confidence).toBe('high');
  });

  it('matches King County field names', () => {
    const fields = [
      'OBJECTID', 'PIN', 'MAJOR', 'MINOR', 'TAXPAYER_NAME',
      'PROP_ADDR', 'GIS_ACRES', 'Shape',
    ];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('PIN');
    expect(result!.field_map.owner_name).toBe('TAXPAYER_NAME');
    expect(result!.field_map.site_address).toBe('PROP_ADDR');
    expect(result!.field_map.acres).toBe('GIS_ACRES');
    expect(result!.confidence).toBe('high');
  });

  it('returns low confidence when only parcel_id matched', () => {
    const fields = ['OBJECTID', 'PARCEL_NUM', 'Shape', 'GlobalID'];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('PARCEL_NUM');
    expect(result!.confidence).toBe('low');
  });

  it('returns medium confidence with parcel_id + one other', () => {
    const fields = ['OBJECTID', 'APN', 'OWNER', 'Shape'];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('APN');
    expect(result!.field_map.owner_name).toBe('OWNER');
    expect(result!.confidence).toBe('medium');
  });

  it('returns null when no parcel_id field found', () => {
    const fields = ['OBJECTID', 'Shape', 'GlobalID', 'NAME'];
    const result = matchFields(fields);
    expect(result).toBeNull();
  });

  it('handles case-insensitive matching', () => {
    const fields = ['objectid', 'apn', 'owner_name', 'site_addr', 'acres'];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('apn');
  });

  it('prefers exact matches over substring matches', () => {
    const fields = ['APN', 'APN_SUFFIX', 'OWNER'];
    const result = matchFields(fields);
    expect(result!.field_map.parcel_id).toBe('APN');
  });
});
