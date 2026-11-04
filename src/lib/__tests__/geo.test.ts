import { describe, it, expect } from 'vitest';
import { haversine, cumulativeDistances, snapToLine, pointAtDistance, simplify, bearing, formatDuration, formatDistance } from '../geo';
import { coords } from './fixture';

describe('geo', () => {
  it('haversine: 0.0009° lat ≈ 100 m', () => {
    expect(haversine([8.5, 47.0], [8.5, 47.0009])).toBeCloseTo(100.07, 0);
  });
  it('cumulativeDistances starts at 0 and is monotonic', () => {
    const cum = cumulativeDistances(coords);
    expect(cum[0]).toBe(0);
    expect(cum.at(-1)!).toBeCloseTo(2001.5, -1);
    cum.forEach((d, i) => i && expect(d).toBeGreaterThan(cum[i - 1]));
  });
  it('snapToLine projects a point 50 m east onto the line', () => {
    const cum = cumulativeDistances(coords);
    const p = [coords[5][0] + 50 / (111320 * Math.cos(47.38 * Math.PI / 180)), coords[5][1]];
    const s = snapToLine(p, coords, cum)!;
    expect(s.offset).toBeCloseTo(50, 0);
    expect(s.distAlong).toBeCloseTo(cum[5], -1);
  });
  it('snapToLine honours a search window hint', () => {
    const s = snapToLine(coords[18], coords, undefined, 2, 4)!;
    expect(s.segIdx).toBeLessThanOrEqual(6);
  });
  it('pointAtDistance interpolates', () => {
    const cum = cumulativeDistances(coords);
    const p = pointAtDistance(coords, cum, cum[2] + (cum[3] - cum[2]) / 2);
    expect(p[1]).toBeCloseTo((coords[2][1] + coords[3][1]) / 2, 6);
    expect(p[2]).toBeCloseTo(420, 3);
  });
  it('simplify keeps endpoints and drops collinear points', () => {
    const s = simplify(coords, 5);
    expect(s).toHaveLength(2);
    expect(s[0]).toBe(coords[0]);
    expect(s[1]).toBe(coords.at(-1));
  });
  it('bearing north ≈ 0, east ≈ 90', () => {
    expect(bearing([8, 47], [8, 47.1])).toBeCloseTo(0, 0);
    expect(bearing([8, 47], [8.1, 47])).toBeCloseTo(90, 0);
  });
  it('formats', () => {
    expect(formatDuration(3900)).toBe('1:05 h');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDistance(432)).toBe('430 m');
    expect(formatDistance(12345)).toBe('12 km');
  });
});
