// src/components/shared/IconPicker/__tests__/icon-catalog.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchIcons, getEmojis, type IconEntry } from '../icon-catalog';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  icons: {
    Bird: () => null,
    MapPin: () => null,
    Camera: () => null,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: () => null,
  MapPinIcon: () => null,
}));

describe('icon-catalog', () => {
  it('getEmojis returns entries with set=emoji', () => {
    const emojis = getEmojis();
    expect(emojis.length).toBeGreaterThan(0);
    expect(emojis.every((e) => e.set === 'emoji')).toBe(true);
  });

  it('getEmojis entries have category field', () => {
    const emojis = getEmojis();
    expect(emojis.every((e) => typeof e.category === 'string')).toBe(true);
  });

  it('searchIcons finds emojis by name', async () => {
    const results = await searchIcons('bird', 'emoji');
    expect(results.some((e) => e.name === '🐦')).toBe(true);
  });

  it('searchIcons with no set searches all', async () => {
    const results = await searchIcons('bird');
    const sets = new Set(results.map((e) => e.set));
    expect(sets.has('emoji')).toBe(true);
  });

  it('searchIcons limits to 200 results', async () => {
    const results = await searchIcons('a');
    expect(results.length).toBeLessThanOrEqual(200);
  });
});
