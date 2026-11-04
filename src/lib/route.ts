import type { BRouterGeoJSON, ElevationPoint } from '../types';
import { haversine } from './geo';

/** A stretch of the route sharing one set of OSM way tags (from BRouter messages). */
export interface WaySegment {
  /** Start distance along route (m). */
  from: number;
  /** End distance along route (m). */
  to: number;
  tags: Record<string, string>;
}

export function parseTags(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.trim().split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

/**
 * Build an elevation profile that always starts at distance 0.
 * BRouter's `messages` rows start at the first decision point, so the GeoJSON
 * start coordinate is prepended. Falls back to the raw geometry when there are
 * no usable messages.
 */
export function buildElevationProfile(geojson: BRouterGeoJSON): ElevationPoint[] {
  const props = geojson.features[0].properties;
  const messages = props.messages;

  if (messages && Array.isArray(messages) && messages.length > 1) {
    const headers = messages[0];
    const lonI  = headers.indexOf('Longitude');
    const latI  = headers.indexOf('Latitude');
    const eleI  = headers.indexOf('Elevation');
    const distI = headers.indexOf('Distance');
    if (lonI >= 0 && latI >= 0 && eleI >= 0 && distI >= 0) {
      const c0 = geojson.features[0].geometry.coordinates[0];
      const start: ElevationPoint = {
        distance:  0,
        elevation: c0?.[2] ?? parseFloat(messages[1][eleI]),
        lat:       c0?.[1] ?? parseInt(messages[1][latI]) / 1e6,
        lon:       c0?.[0] ?? parseInt(messages[1][lonI]) / 1e6,
      };
      let cum = 0;
      const rest = messages.slice(1).map(row => {
        cum += parseFloat(row[distI]) || 0;
        return {
          distance:  cum,
          elevation: parseFloat(row[eleI]),
          lat:       parseInt(row[latI]) / 1e6,
          lon:       parseInt(row[lonI]) / 1e6,
        };
      });
      return [start, ...rest];
    }
  }

  const coords = geojson.features[0].geometry.coordinates;
  if (coords.length > 0 && coords[0].length >= 3) {
    let cum = 0;
    const profile: ElevationPoint[] = [{ distance: 0, elevation: coords[0][2], lat: coords[0][1], lon: coords[0][0] }];
    for (let i = 1; i < coords.length; i++) {
      cum += haversine(coords[i - 1], coords[i]);
      profile.push({ distance: cum, elevation: coords[i][2], lat: coords[i][1], lon: coords[i][0] });
    }
    return profile;
  }
  return [];
}

/** Way segments with OSM tags, derived from BRouter `messages` (needs the WayTags column). */
export function buildWaySegments(geojson: BRouterGeoJSON): WaySegment[] {
  const messages = geojson.features[0].properties.messages;
  if (!messages || messages.length < 2) return [];
  const h = messages[0];
  const distI = h.indexOf('Distance');
  const tagI  = h.indexOf('WayTags');
  if (distI < 0 || tagI < 0) return [];
  const segs: WaySegment[] = [];
  let cum = 0;
  for (const row of messages.slice(1)) {
    const d = parseFloat(row[distI]) || 0;
    segs.push({ from: cum, to: cum + d, tags: parseTags(row[tagI]) });
    cum += d;
  }
  return segs;
}

/** A short signature to detect duplicate routes across profiles. */
export function computeSignature(geojson: BRouterGeoJSON): string {
  const c   = geojson.features[0].geometry.coordinates;
  const len = geojson.features[0].properties['track-length'];
  const sample = [0, Math.floor(c.length / 4), Math.floor(c.length / 2), Math.floor(3 * c.length / 4), c.length - 1]
    .map(i => c[i] ? `${c[i][0].toFixed(4)},${c[i][1].toFixed(4)}` : '')
    .join('|');
  return `${len}|${sample}`;
}

export interface RouteSummary {
  lengthM: number;
  timeS: number;
  ascentM: number;
  descentM: number;
  minEle: number;
  maxEle: number;
}

export function summarize(geojson: BRouterGeoJSON, profile: ElevationPoint[]): RouteSummary {
  const p = geojson.features[0].properties;
  let descent = 0;
  let minEle = Infinity, maxEle = -Infinity;
  for (let i = 0; i < profile.length; i++) {
    const e = profile[i].elevation;
    if (e < minEle) minEle = e;
    if (e > maxEle) maxEle = e;
    if (i > 0) {
      const diff = e - profile[i - 1].elevation;
      if (diff < 0) descent -= diff;
    }
  }
  return {
    lengthM:  parseInt(p['track-length'] ?? '0') || 0,
    timeS:    parseInt(p['total-time'] ?? '0') || 0,
    ascentM:  parseInt(p['filtered ascend'] ?? p['plain-ascend'] ?? '0') || 0,
    descentM: Math.round(descent),
    minEle:   Number.isFinite(minEle) ? minEle : 0,
    maxEle:   Number.isFinite(maxEle) ? maxEle : 0,
  };
}
