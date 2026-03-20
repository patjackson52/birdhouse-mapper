import { describe, it, expect } from 'vitest';
import { distanceBetween, formatDistance, getDistanceToItem } from '../utils';

describe('distanceBetween', () => {
  it('returns 0 for same point', () => {
    expect(distanceBetween(47.6, -122.5, 47.6, -122.5)).toBe(0);
  });

  it('calculates distance between two known points', () => {
    // Seattle (47.6062, -122.3321) to Portland (45.5152, -122.6784) ~234km
    const d = distanceBetween(47.6062, -122.3321, 45.5152, -122.6784);
    expect(d).toBeGreaterThan(230000);
    expect(d).toBeLessThan(240000);
  });

  it('calculates short distance accurately', () => {
    // ~111 meters (0.001 degree latitude at equator)
    const d = distanceBetween(0, 0, 0.001, 0);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe('formatDistance', () => {
  it('formats short distances in feet', () => {
    expect(formatDistance(30)).toBe('98 ft'); // 30m * 3.28
  });

  it('formats medium distances in feet', () => {
    expect(formatDistance(100)).toBe('328 ft');
  });

  it('switches to miles at ~1000 ft (305m)', () => {
    expect(formatDistance(305)).toMatch(/mi$/);
  });

  it('formats miles with one decimal', () => {
    expect(formatDistance(1609)).toBe('1.0 mi'); // 1 mile
  });

  it('formats longer distances', () => {
    expect(formatDistance(8046)).toBe('5.0 mi'); // 5 miles
  });
});

describe('getDistanceToItem', () => {
  it('returns null when position is null', () => {
    expect(getDistanceToItem(null, { latitude: 47.6, longitude: -122.5 })).toBeNull();
  });

  it('returns distance in meters when position is available', () => {
    const d = getDistanceToItem(
      { lat: 47.6, lng: -122.5 },
      { latitude: 47.601, longitude: -122.501 }
    );
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    expect(d!).toBeLessThan(200);
  });
});
