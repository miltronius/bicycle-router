import { describe, it, expect } from 'vitest';
import { buildElevationProfile, buildWaySegments, computeSignature, parseTags, summarize } from '../route';
import { fixture } from './fixture';

describe('route', () => {
  it('profile starts at distance 0 with the GeoJSON start coordinate', () => {
    const p = buildElevationProfile(fixture);
    expect(p[0]).toMatchObject({ distance: 0, elevation: 410, lat: 47.3773, lon: 8.5374 });
    expect(p.map(x => x.distance)).toEqual([0, 500, 1000, 2002]);
  });
  it('falls back to geometry when messages are missing', () => {
    const f = structuredClone(fixture);
    delete f.features[0].properties.messages;
    const p = buildElevationProfile(f);
    expect(p).toHaveLength(21);
    expect(p.at(-1)!.distance).toBeGreaterThan(1990);
  });
  it('way segments carry parsed tags and cumulative ranges', () => {
    const s = buildWaySegments(fixture);
    expect(s).toHaveLength(3);
    expect(s[1]).toMatchObject({ from: 500, to: 1000, tags: { highway: 'primary', maxspeed: '50' } });
  });
  it('parseTags handles blanks', () => {
    expect(parseTags('')).toEqual({});
    expect(parseTags(' a=b  c=d=e ')).toEqual({ a: 'b', c: 'd=e' });
  });
  it('signature is stable and differs for different tracks', () => {
    const f2 = structuredClone(fixture);
    f2.features[0].geometry.coordinates[10] = [9, 47, 0];
    expect(computeSignature(fixture)).toBe(computeSignature(structuredClone(fixture)));
    expect(computeSignature(fixture)).not.toBe(computeSignature(f2));
  });
  it('summarize computes ascent/descent/min/max', () => {
    const s = summarize(fixture, buildElevationProfile(fixture));
    expect(s).toMatchObject({ lengthM: 2002, timeS: 480, ascentM: 40, descentM: 0, minEle: 410, maxEle: 450 });
  });
});
