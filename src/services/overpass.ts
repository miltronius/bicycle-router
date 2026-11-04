import { buildOverpassQuery, parseOverpass } from '../lib/poi';
import type { Poi, PoiCategory } from '../lib/poi';
import { simplify } from '../lib/geo';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const cache = new Map<string, Poi[]>();

/** Fetch POIs within `radius` m of the route. Cached per (route signature, categories). */
export async function fetchPoisAlong(
  routeKey: string, coords: number[][], categories: PoiCategory[], radius = 150, signal?: AbortSignal,
): Promise<Poi[]> {
  if (categories.length === 0) return [];
  const key = `${routeKey}|${radius}|${[...categories].sort().join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // Keep the query small: simplify until ≤ 180 vertices.
  let tol = 15, line = simplify(coords, tol);
  while (line.length > 180 && tol < 2000) { tol *= 1.6; line = simplify(coords, tol); }
  const query = buildOverpassQuery(line, categories, radius);

  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal });
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
      const pois = parseOverpass(await r.json(), categories);
      cache.set(key, pois);
      return pois;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass unavailable');
}
