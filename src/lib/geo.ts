// Pure geometry helpers. Coordinates follow GeoJSON order: [lon, lat, ele?].

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres between two [lon, lat] pairs. */
export function haversine(a: number[], b: number[]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]));
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Cumulative distance (m) at every vertex; result[0] === 0. */
export function cumulativeDistances(coords: number[][]): number[] {
  const out = new Array<number>(coords.length);
  let cum = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) cum += haversine(coords[i - 1], coords[i]);
    out[i] = cum;
  }
  return out;
}

export interface SnapResult {
  /** Distance along the line (m) of the projected point. */
  distAlong: number;
  /** Perpendicular distance (m) from the input point to the line. */
  offset: number;
  /** Index of the segment start vertex. */
  segIdx: number;
  /** The projected point [lon, lat]. */
  point: [number, number];
}

/**
 * Project a [lon, lat] point onto a polyline using a local equirectangular
 * approximation (accurate to well under a metre at route scales).
 * `cum` may be passed to avoid recomputing cumulative distances.
 * `hintIdx` + `window` restrict the search to segments near a previous match
 * (used by live mode so the rider doesn't "jump" to a later overlapping part).
 */
export function snapToLine(
  p: number[],
  coords: number[][],
  cum: number[] = cumulativeDistances(coords),
  hintIdx?: number,
  window = 200,
): SnapResult | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return { distAlong: 0, offset: haversine(p, coords[0]), segIdx: 0, point: [coords[0][0], coords[0][1]] };
  }
  const kx = Math.cos(toRad(p[1])) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  let lo = 0, hi = coords.length - 1;
  if (hintIdx !== undefined) {
    lo = Math.max(0, hintIdx - Math.floor(window / 4));
    hi = Math.min(coords.length - 1, hintIdx + window);
  }
  let best: SnapResult | null = null;
  let bestD2 = Infinity;
  for (let i = lo; i < hi; i++) {
    const a = coords[i], b = coords[i + 1];
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
    const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const d2 = px * px + py * py;
    if (d2 < bestD2) {
      bestD2 = d2;
      const segLen = cum[i + 1] - cum[i];
      best = {
        distAlong: cum[i] + t * segLen,
        offset: Math.sqrt(d2),
        segIdx: i,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
      };
    }
  }
  return best;
}

/** Interpolate the [lon, lat, ele?] position at a given distance along the line. */
export function pointAtDistance(coords: number[][], cum: number[], d: number): number[] {
  if (coords.length === 0) return [0, 0];
  if (d <= 0) return coords[0];
  const last = coords.length - 1;
  if (d >= cum[last]) return coords[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (d - cum[lo]) / seg : 0;
  const a = coords[lo], b = coords[hi];
  return a.map((v, k) => v + t * ((b[k] ?? v) - v));
}

/**
 * Douglas–Peucker simplification with a tolerance in metres.
 * Keeps first and last points; returns a new array.
 */
export function simplify(coords: number[][], toleranceM: number): number[][] {
  if (coords.length <= 2) return coords.slice();
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    const seg = [coords[s], coords[e]];
    const segCum = [0, haversine(coords[s], coords[e])];
    for (let i = s + 1; i < e; i++) {
      const snap = snapToLine(coords[i], seg, segCum);
      const d = snap ? snap.offset : 0;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceM && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Bearing in degrees (0 = north, clockwise) from a to b. */
export function bearing(a: number[], b: number[]): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
            Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}
