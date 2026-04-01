import { describe, it, expect } from 'vitest';
import { calculateTileBounds, getTileUrls } from '../tile-manager';

describe('Tile Manager', () => {
  describe('calculateTileBounds', () => {
    it('should return tile coordinates for a bounding box at a zoom level', () => {
      const bounds = { north: 44.98, south: 44.97, east: -93.26, west: -93.28 };
      const tiles = calculateTileBounds(bounds, 15);
      expect(tiles.minX).toBeLessThan(tiles.maxX);
      expect(tiles.minY).toBeLessThan(tiles.maxY);
      expect(tiles.zoom).toBe(15);
    });

    it('should return more tiles at higher zoom levels', () => {
      const bounds = { north: 44.98, south: 44.97, east: -93.26, west: -93.28 };
      const tiles14 = calculateTileBounds(bounds, 14);
      const tiles16 = calculateTileBounds(bounds, 16);
      const count14 = (tiles14.maxX - tiles14.minX + 1) * (tiles14.maxY - tiles14.minY + 1);
      const count16 = (tiles16.maxX - tiles16.minX + 1) * (tiles16.maxY - tiles16.minY + 1);
      expect(count16).toBeGreaterThan(count14);
    });
  });

  describe('getTileUrls', () => {
    it('should generate OSM tile URLs for a tile range', () => {
      const urls = getTileUrls(
        { minX: 0, maxX: 1, minY: 0, maxY: 1, zoom: 10 },
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      );
      expect(urls).toHaveLength(4);
      expect(urls[0]).toBe('https://tile.openstreetmap.org/10/0/0.png');
      expect(urls[3]).toBe('https://tile.openstreetmap.org/10/1/1.png');
    });
  });
});
