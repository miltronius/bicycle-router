import type { BRouterGeoJSON, Point } from '../types';

export const BROUTER_URL = (import.meta.env.VITE_BROUTER_URL as string | undefined) ?? 'https://brouter.de/brouter';

export function brouterUrl(waypoints: Pick<Point, 'lat' | 'lng'>[], profile: string): string {
  const lonlats = waypoints.map(w => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join('|');
  return `${BROUTER_URL}?lonlats=${lonlats}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`;
}

export async function fetchRoute(waypoints: Pick<Point, 'lat' | 'lng'>[], profile: string, signal?: AbortSignal): Promise<BRouterGeoJSON> {
  const r = await fetch(brouterUrl(waypoints, profile), { signal });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(text.trim().slice(0, 200) || `HTTP ${r.status}`);
  }
  const json = await r.json() as BRouterGeoJSON;
  if (!json?.features?.[0]?.geometry?.coordinates?.length) throw new Error('Empty route');
  return json;
}
