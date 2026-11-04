import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../url';

describe('url', () => {
  const wps = [
    { lat: 47.3773, lng: 8.5374, name: 'Zürich HB' },
    { lat: 47.35, lng: 8.5, name: 'Via | odd~name' },
    { lat: 47.2752, lng: 8.4528, name: 'Affoltern' },
  ];
  it('round-trips waypoints, profile and map', () => {
    const s = encodeState({ waypoints: wps, profile: 'trekking', map: 'swisstopo' });
    const d = decodeState(s);
    expect(d.profile).toBe('trekking');
    expect(d.map).toBe('swisstopo');
    expect(d.waypoints).toHaveLength(3);
    expect(d.waypoints![0]).toEqual({ lat: 47.3773, lng: 8.5374, name: 'Zürich HB' });
    expect(d.waypoints![1].name).toBe('Via   odd name');
  });
  it('rejects out-of-bounds or malformed waypoints', () => {
    expect(decodeState('?wp=52.5,13.4|47.3,8.5').waypoints).toBeUndefined();
    expect(decodeState('?wp=abc').waypoints).toBeUndefined();
    expect(decodeState('?wp=47.3,8.5').waypoints).toBeUndefined();
    expect(decodeState('?p=<script>').profile).toBeUndefined();
  });
  it('fills missing names with coordinates', () => {
    expect(decodeState('?wp=47.3,8.5|47.4,8.6').waypoints![0].name).toBe('47.30000, 8.50000');
  });
});
