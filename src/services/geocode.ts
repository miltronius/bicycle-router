import { NOMINATIM_VIEWBOX, PHOTON_BBOX } from '../constants';
import { formatLatLng } from '../lib/geo';

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Short label for the input once selected. */
  name: string;
  /** Secondary line in the dropdown. */
  detail: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string; postcode?: string;
    city?: string; district?: string; locality?: string; state?: string; country?: string;
    osm_value?: string;
  };
}

export function photonLabel(p: PhotonFeature['properties']): { name: string; detail: string } {
  const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : undefined;
  const name = p.name ?? street ?? p.city ?? 'Unnamed place';
  const place = p.city ?? p.locality ?? p.district;
  const detail = [p.name ? street : undefined, place !== name ? place : undefined, p.state].filter(Boolean).join(', ');
  return { name: place && place !== name ? `${name}, ${place}` : name, detail };
}

/**
 * Forward search for the autocomplete box via Photon (komoot) — designed for
 * search-as-you-type, unlike Nominatim whose usage policy forbids it.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  if (query.trim().length < 3) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=de&bbox=${PHOTON_BBOX}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json() as { features?: PhotonFeature[] };
  return (json.features ?? []).map(f => {
    const { name, detail } = photonLabel(f.properties);
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name, detail };
  });
}

/** One-off Nominatim search (used on Enter as a fallback when Photon is down). */
export async function searchNominatim(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  await nominatimSlot();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${NOMINATIM_VIEWBOX}&bounded=1`;
  const r = await fetch(url, { signal, headers: { 'Accept-Language': 'de,en' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json() as { lat: string; lon: string; display_name: string }[];
  return json.map(x => {
    const parts = x.display_name.split(',').map(s => s.trim());
    return { lat: parseFloat(x.lat), lng: parseFloat(x.lon), name: parts.slice(0, 2).join(', '), detail: parts.slice(2, 4).join(', ') };
  });
}

// Nominatim allows at most 1 request per second — serialise calls.
let nextNominatim = 0;
function nominatimSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextNominatim);
  nextNominatim = at + 1100;
  return new Promise(res => setTimeout(res, at - now));
}

const reverseCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseCache.get(key);
  if (cached) return cached;
  try {
    await nominatimSlot();
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
      { headers: { 'Accept-Language': 'de,en' } },
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [
      a.road ?? a.pedestrian ?? a.path ?? a.footway ?? a.cycleway,
      a.suburb ?? a.quarter ?? a.neighbourhood ?? a.village ?? a.hamlet,
      a.city ?? a.town ?? a.municipality,
    ].filter(Boolean);
    const name = parts.slice(0, 2).join(', ') || (data.display_name ?? '').split(',')[0] || formatLatLng(lat, lng);
    reverseCache.set(key, name);
    return name;
  } catch {
    return formatLatLng(lat, lng);
  }
}
