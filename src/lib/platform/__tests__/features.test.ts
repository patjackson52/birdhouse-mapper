import { describe, it, expect } from 'vitest';
import {
  PLATFORM_FEATURES,
  TIER_DEFAULTS,
  resolveFeatures,
  type FeatureMap,
} from '../features';

describe('PLATFORM_FEATURES', () => {
  it('has type and label for every feature', () => {
    for (const [key, def] of Object.entries(PLATFORM_FEATURES)) {
      expect(def).toHaveProperty('type');
      expect(def).toHaveProperty('label');
      expect(['boolean', 'numeric']).toContain(def.type);
      expect(typeof def.label).toBe('string');
    }
  });
});

describe('TIER_DEFAULTS', () => {
  it('defines defaults for all four tiers', () => {
    expect(Object.keys(TIER_DEFAULTS)).toEqual(['free', 'community', 'pro', 'municipal']);
  });

  it('has a value for every feature in every tier', () => {
    const featureKeys = Object.keys(PLATFORM_FEATURES);
    for (const tier of Object.keys(TIER_DEFAULTS)) {
      const defaults = TIER_DEFAULTS[tier as keyof typeof TIER_DEFAULTS];
      for (const key of featureKeys) {
        expect(defaults).toHaveProperty(key);
      }
    }
  });
});

describe('resolveFeatures', () => {
  it('returns tier defaults when no overrides', () => {
    const result = resolveFeatures('free', []);
    expect(result.tasks).toBe(false);
    expect(result.public_forms).toBe(true);
    expect(result.max_properties).toBe(1);
    expect(result.max_members).toBe(5);
  });

  it('applies boolean overrides', () => {
    const overrides = [
      { feature: 'tasks', value: true },
      { feature: 'reports', value: true },
    ];
    const result = resolveFeatures('free', overrides);
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    expect(result.volunteers).toBe(false);
  });

  it('applies numeric overrides', () => {
    const overrides = [
      { feature: 'max_properties', value: 10 },
      { feature: 'storage_limit_mb', value: null },
    ];
    const result = resolveFeatures('free', overrides);
    expect(result.max_properties).toBe(10);
    expect(result.storage_limit_mb).toBeNull();
    expect(result.max_members).toBe(5);
  });

  it('works with pro tier defaults', () => {
    const result = resolveFeatures('pro', []);
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    expect(result.max_properties).toBeNull();
    expect(result.storage_limit_mb).toBe(5000);
  });

  it('overrides can downgrade pro features', () => {
    const overrides = [
      { feature: 'reports', value: false },
      { feature: 'max_properties', value: 5 },
    ];
    const result = resolveFeatures('pro', overrides);
    expect(result.reports).toBe(false);
    expect(result.max_properties).toBe(5);
  });

  it('ignores unknown feature keys in overrides', () => {
    const overrides = [{ feature: 'nonexistent_feature', value: true }];
    const result = resolveFeatures('free', []);
    const resultWithUnknown = resolveFeatures('free', overrides);
    expect(resultWithUnknown).toEqual(result);
  });
});
