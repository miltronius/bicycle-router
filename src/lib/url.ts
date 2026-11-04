// Shareable URL state (#8).
//   ?wp=47.37730,8.53740~Zürich HB|47.27520,8.45280~Affoltern&p=trekking&map=swisstopo
// Waypoints are an ordered list so multi-stop routes (#2) round-trip.

import type { Point } from '../types';
import { BOUNDS_NE, BOUNDS_SW } from '../constants';

export interface UrlState {
  waypoints?: Point[];
  profile?: string;
  map?: string;
}

export function inBounds(lat: number, lng: number): boolean {
  return lat >= BOUNDS_SW[0] && lat <= BOUNDS_NE[0] && lng >= BOUNDS_SW[1] && lng <= BOUNDS_NE[1];
}

export function encodeWaypoints(wps: Point[]): string {
  return wps.map(w => {
    const name = w.name.replace(/[|~]/g, ' ').slice(0, 48);
    return `${w.lat.toFixed(5)},${w.lng.toFixed(5)}${name ? '~' + name : ''}`;
  }).join('|');
}

export function decodeWaypoints(s: string): Point[] | undefined {
  const out: Point[] = [];
  for (const part of s.split('|')) {
    const [coord, name] = part.split('~');
    const [la, ln] = (coord ?? '').split(',').map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || !inBounds(la, ln)) return undefined;
    out.push({ lat: la, lng: ln, name: name?.trim() || `${la.toFixed(5)}, ${ln.toFixed(5)}` });
  }
  return out.length >= 2 ? out : undefined;
}

export function encodeState(st: UrlState): string {
  const p = new URLSearchParams();
  if (st.waypoints && st.waypoints.length >= 2) p.set('wp', encodeWaypoints(st.waypoints));
  if (st.profile) p.set('p', st.profile);
  if (st.map) p.set('map', st.map);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function decodeState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const st: UrlState = {};
  const wp = p.get('wp');
  if (wp) st.waypoints = decodeWaypoints(wp);
  const prof = p.get('p');
  if (prof && /^[\w-]{1,40}$/.test(prof)) st.profile = prof;
  const map = p.get('map');
  if (map && /^[\w-]{1,40}$/.test(map)) st.map = map;
  return st;
}
