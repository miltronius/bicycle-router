// Live mode (#6): pure tracking logic — snap fixes to the route, measure
// progress, detect off-route, and find what's coming next.

import { snapToLine } from './geo';
import type { ElevationPoint } from '../types';

export const OFF_ROUTE_M = 40;
export const OFF_ROUTE_MS = 8000;

export interface TrackerState {
  segIdx: number | undefined;
  distAlong: number;
  offset: number;
  offRouteSince: number | null;
  /** Recorded ride: [lon, lat, ele?] + timestamps (ms). */
  track: number[][];
  times: number[];
  /** Moving time (ms) — gaps > 30 s or speed < 1 m/s are excluded. */
  movingMs: number;
  ridden: number;
}

export function initialTracker(): TrackerState {
  return { segIdx: undefined, distAlong: 0, offset: 0, offRouteSince: null, track: [], times: [], movingMs: 0, ridden: 0 };
}

export interface Fix { lat: number; lng: number; accuracy: number; timestamp: number }

function dist(a: number[], b: number[]): number {
  const kx = Math.cos((a[1] * Math.PI) / 180) * 111320;
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110540);
}

export function updateTracker(s: TrackerState, fix: Fix, coords: number[][], cum: number[]): TrackerState {
  const p = [fix.lng, fix.lat];
  // Search near the last match first; fall back to the full line if we seem lost.
  let snap = snapToLine(p, coords, cum, s.segIdx, 300);
  if (!snap || snap.offset > OFF_ROUTE_M * 2) snap = snapToLine(p, coords, cum) ?? snap;
  const tolerance = Math.max(OFF_ROUTE_M, fix.accuracy);
  const off = !!snap && snap.offset > tolerance;
  const last = s.track[s.track.length - 1];
  const lastT = s.times[s.times.length - 1];
  let { movingMs, ridden } = s;
  if (last && lastT !== undefined) {
    const d = dist(last, p);
    const dt = fix.timestamp - lastT;
    if (dt > 0 && dt < 30000 && d / (dt / 1000) > 1) { movingMs += dt; ridden += d; }
  }
  // Skip recording near-duplicate points (< 3 m)
  const record = !last || dist(last, p) >= 3;
  return {
    segIdx: snap?.segIdx,
    distAlong: snap ? (off ? s.distAlong : snap.distAlong) : s.distAlong,
    offset: snap?.offset ?? 0,
    offRouteSince: off ? (s.offRouteSince ?? fix.timestamp) : null,
    track: record ? [...s.track, p] : s.track,
    times: record ? [...s.times, fix.timestamp] : s.times,
    movingMs, ridden,
  };
}

export function shouldReroute(s: TrackerState, now: number): boolean {
  return s.offRouteSince !== null && now - s.offRouteSince >= OFF_ROUTE_MS;
}

/** Positive elevation gain (m) remaining after `fromDist`. */
export function remainingAscent(profile: ElevationPoint[], fromDist: number): number {
  let gain = 0;
  for (let i = 1; i < profile.length; i++) {
    if (profile[i].distance <= fromDist) continue;
    const prev = profile[i - 1];
    const startEle = prev.distance >= fromDist ? prev.elevation
      : prev.elevation + (profile[i].elevation - prev.elevation) * ((fromDist - prev.distance) / (profile[i].distance - prev.distance || 1));
    const diff = profile[i].elevation - startEle;
    if (diff > 0) gain += diff;
  }
  return gain;
}

export interface Climb { start: number; end: number; gain: number; avgGrade: number }

/**
 * Find sustained climbs: stretches ≥ minLen m averaging ≥ minGrade.
 * Uses the profile points directly (BRouter message rows are already coarse).
 */
export function findClimbs(profile: ElevationPoint[], minGrade = 0.04, minLen = 300): Climb[] {
  const climbs: Climb[] = [];
  let i = 0;
  while (i < profile.length - 1) {
    // Extend while each step is uphill-ish (≥ 1 %), then test the aggregate
    let j = i;
    while (j < profile.length - 1) {
      const a = profile[j], b = profile[j + 1];
      const g = (b.elevation - a.elevation) / Math.max(1, b.distance - a.distance);
      if (g < 0.01) break;
      j++;
    }
    if (j > i) {
      const len = profile[j].distance - profile[i].distance;
      const gain = profile[j].elevation - profile[i].elevation;
      if (len >= minLen && gain / len >= minGrade) {
        climbs.push({ start: profile[i].distance, end: profile[j].distance, gain, avgGrade: gain / len });
      }
      i = j;
    } else {
      i++;
    }
  }
  return climbs;
}
