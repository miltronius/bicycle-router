import { describe, it, expect } from 'vitest';
import { initialTracker, updateTracker, shouldReroute, remainingAscent, findClimbs, OFF_ROUTE_MS } from '../live';
import { cumulativeDistances } from '../geo';
import { coords } from './fixture';

const cum = cumulativeDistances(coords);
const fixAt = (lat: number, lng: number, t: number) => ({ lat, lng, accuracy: 5, timestamp: t });

describe('live tracker', () => {
  it('tracks progress and moving distance along the route', () => {
    let s = initialTracker();
    s = updateTracker(s, fixAt(coords[0][1], coords[0][0], 0), coords, cum);
    s = updateTracker(s, fixAt(coords[2][1], coords[2][0], 40000 / 2), coords, cum);
    s = updateTracker(s, fixAt(coords[4][1], coords[4][0], 40000), coords, cum);
    expect(s.distAlong).toBeCloseTo(cum[4], 0);
    expect(s.offRouteSince).toBeNull();
    expect(s.track).toHaveLength(3);
    expect(s.ridden).toBeCloseTo(cum[4], -1);
    expect(s.movingMs).toBe(40000);
  });
  it('flags off-route after the grace period and freezes progress', () => {
    let s = updateTracker(initialTracker(), fixAt(coords[3][1], coords[3][0], 0), coords, cum);
    const farLng = coords[3][0] + 0.002; // ~150 m east
    s = updateTracker(s, fixAt(coords[5][1], farLng, 1000), coords, cum);
    expect(s.offRouteSince).toBe(1000);
    expect(s.distAlong).toBeCloseTo(cum[3], 0);
    expect(shouldReroute(s, 1000 + OFF_ROUTE_MS - 1)).toBe(false);
    expect(shouldReroute(s, 1000 + OFF_ROUTE_MS)).toBe(true);
    s = updateTracker(s, fixAt(coords[6][1], coords[6][0], 2000), coords, cum);
    expect(s.offRouteSince).toBeNull();
  });
});

describe('profile helpers', () => {
  const prof = [0, 200, 400, 600, 800, 1000].map((d, i) => ({ distance: d, elevation: [400, 410, 430, 450, 450, 440][i], lat: 0, lon: 0 }));
  it('remainingAscent interpolates the current position', () => {
    expect(remainingAscent(prof, 0)).toBe(50);
    expect(remainingAscent(prof, 300)).toBeCloseTo(30, 5);
    expect(remainingAscent(prof, 700)).toBe(0);
  });
  it('findClimbs finds the sustained climb', () => {
    const c = findClimbs(prof, 0.04, 300);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ start: 0, end: 600, gain: 50 });
  });
});
