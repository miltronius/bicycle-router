// Route segmentation (#11): classify OSM way tags into traffic-exposure and
// surface classes.

import type { WaySegment } from './route';

export type SafetyClass = 'safe' | 'medium' | 'exposed' | 'unknown';
export type SurfaceClass = 'paved' | 'gravel' | 'unpaved' | 'unknown';

export const SAFETY_COLORS: Record<SafetyClass, string> = {
  safe: '#2f8f46', medium: '#e0a100', exposed: '#c83737', unknown: '#8a8775',
};
export const SURFACE_COLORS: Record<SurfaceClass, string> = {
  paved: '#2c5f7c', gravel: '#b07a3c', unpaved: '#6b4a2b', unknown: '#8a8775',
};
export const SAFETY_LABELS: Record<SafetyClass, string> = {
  safe: 'Separated / calm', medium: 'Bike lane / quiet road', exposed: 'Mixed traffic', unknown: 'Unknown',
};
export const SURFACE_LABELS: Record<SurfaceClass, string> = {
  paved: 'Paved', gravel: 'Gravel', unpaved: 'Unpaved', unknown: 'Unknown',
};

const CAR_FREE = new Set(['cycleway', 'path', 'footway', 'track', 'pedestrian', 'bridleway', 'steps']);
const MAJOR = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'trunk_link', 'motorway', 'motorway_link']);
const MINOR = new Set(['tertiary', 'tertiary_link', 'unclassified', 'service', 'road']);
const CALM = new Set(['living_street', 'residential']);

function cyclewayValues(t: Record<string, string>): string[] {
  return ['cycleway', 'cycleway:right', 'cycleway:left', 'cycleway:both']
    .map(k => t[k])
    .filter((v): v is string => !!v);
}

function maxspeed(t: Record<string, string>): number | null {
  const m = t.maxspeed;
  if (!m) return null;
  if (m === 'walk' || m === 'CH:zone20') return 20;
  if (m === 'CH:zone30') return 30;
  if (m === 'CH:urban') return 50;
  if (m === 'CH:rural') return 80;
  const n = parseInt(m, 10);
  return Number.isFinite(n) ? n : null;
}

export function classifySafety(t: Record<string, string>): SafetyClass {
  const hw = t.highway;
  if (!hw) return 'unknown';
  const cw = cyclewayValues(t);
  const speed = maxspeed(t);

  if (CAR_FREE.has(hw) || t.bicycle === 'designated' && !MAJOR.has(hw)) return 'safe';
  if (cw.some(v => v === 'track' || v === 'separate')) return 'safe';
  if (hw === 'living_street') return 'safe';
  if (t.motor_vehicle === 'no' || t.motor_vehicle === 'private' || t.access === 'no') return 'safe';

  const hasLane = cw.some(v => v === 'lane' || v === 'shared_lane' || v === 'share_busway' || v === 'opposite_lane');

  if (MAJOR.has(hw)) {
    if (hasLane && (speed === null || speed <= 60)) return 'medium';
    return 'exposed';
  }
  if (speed !== null && speed >= 70) return hasLane ? 'medium' : 'exposed';
  if (CALM.has(hw)) return speed !== null && speed <= 30 ? 'safe' : 'medium';
  if (MINOR.has(hw)) return speed !== null && speed <= 30 ? 'safe' : 'medium';
  return 'medium';
}

const PAVED = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone', 'chipseal', 'metal', 'wood']);
const GRAVEL = new Set(['gravel', 'fine_gravel', 'compacted', 'pebblestone']);
const UNPAVED = new Set(['unpaved', 'dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'woodchips', 'rock']);

export function classifySurface(t: Record<string, string>): SurfaceClass {
  const s = t.surface;
  if (s) {
    if (PAVED.has(s)) return 'paved';
    if (GRAVEL.has(s)) return 'gravel';
    if (UNPAVED.has(s)) return 'unpaved';
  }
  if (t.tracktype) return t.tracktype === 'grade1' ? 'paved' : t.tracktype === 'grade2' ? 'gravel' : 'unpaved';
  const hw = t.highway;
  if (hw && (MAJOR.has(hw) || MINOR.has(hw) || CALM.has(hw) || hw === 'cycleway')) return 'paved';
  return 'unknown';
}

export interface ClassShare<K extends string> { cls: K; meters: number; pct: number }

export function shareBy<K extends string>(segs: WaySegment[], fn: (t: Record<string, string>) => K, order: K[]): ClassShare<K>[] {
  const totals = new Map<K, number>();
  let total = 0;
  for (const s of segs) {
    const len = s.to - s.from;
    const k = fn(s.tags);
    totals.set(k, (totals.get(k) ?? 0) + len);
    total += len;
  }
  return order
    .map(cls => ({ cls, meters: totals.get(cls) ?? 0, pct: total > 0 ? ((totals.get(cls) ?? 0) / total) * 100 : 0 }))
    .filter(c => c.meters > 0);
}

export const SAFETY_ORDER: SafetyClass[] = ['safe', 'medium', 'exposed', 'unknown'];
export const SURFACE_ORDER: SurfaceClass[] = ['paved', 'gravel', 'unpaved', 'unknown'];

/** Merge consecutive segments of the same class into runs (fewer polylines to draw). */
export function runsBy<K extends string>(segs: WaySegment[], fn: (t: Record<string, string>) => K): { from: number; to: number; cls: K }[] {
  const runs: { from: number; to: number; cls: K }[] = [];
  for (const s of segs) {
    const cls = fn(s.tags);
    const last = runs[runs.length - 1];
    if (last && last.cls === cls && Math.abs(last.to - s.from) < 1) last.to = s.to;
    else runs.push({ from: s.from, to: s.to, cls });
  }
  return runs;
}
