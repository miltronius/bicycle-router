import { describe, it, expect } from 'vitest';
import { buildOverpassQuery, parseOverpass, matchesFilter, categorize } from '../poi';

describe('poi', () => {
  it('builds an around-polyline query', () => {
    const q = buildOverpassQuery([[8.5, 47.3], [8.6, 47.4]], ['water'], 100);
    expect(q).toContain('nwr["amenity"="drinking_water"](around.r:100,47.30000,8.50000,47.40000,8.60000);');
    expect(q).toContain('[out:json]');
  });
  it('matchesFilter supports =, != and ~', () => {
    expect(matchesFilter({ amenity: 'cafe' }, '["amenity"~"^(cafe|restaurant)$"]')).toBe(true);
    expect(matchesFilter({ amenity: 'bar' }, '["amenity"~"^(cafe|restaurant)$"]')).toBe(false);
    expect(matchesFilter({ railway: 'station', station: 'subway' }, '["railway"="station"]["station"!="subway"]')).toBe(false);
  });
  it('categorize respects order and wanted list', () => {
    expect(categorize({ amenity: 'fountain', drinking_water: 'yes' }, ['water', 'food'])).toBe('water');
    expect(categorize({ amenity: 'fountain' }, ['water'])).toBeNull();
  });
  it('parses nodes and way centers, skipping non-drinkable', () => {
    const pois = parseOverpass({ elements: [
      { type: 'node', id: 1, lat: 47.1, lon: 8.1, tags: { amenity: 'drinking_water' } },
      { type: 'way', id: 2, center: { lat: 47.2, lon: 8.2 }, tags: { shop: 'bicycle', name: 'Velo Shop' } },
      { type: 'node', id: 3, lat: 47.3, lon: 8.3, tags: { amenity: 'drinking_water', drinking_water: 'no' } },
    ] }, ['water', 'repair']);
    expect(pois.map(p => [p.id, p.category, p.name])).toEqual([
      ['node/1', 'water', 'Drinking water'],
      ['way/2', 'repair', 'Velo Shop'],
    ]);
  });
});
