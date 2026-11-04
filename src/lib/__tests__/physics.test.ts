import { describe, it, expect } from 'vitest';
import { solveSpeed, estimateRide, flatSpeedKmh, gradeChunks, DEFAULT_RIDER, motorPower, BIKES, powerAtGrade } from '../physics';
import type { RiderSettings } from '../physics';

const road: RiderSettings = { ...DEFAULT_RIDER, bike: 'road', riderKg: 75, riderW: 200 };

describe('physics', () => {
  it('road bike at 200 W on the flat ≈ 31–34 km/h', () => {
    expect(flatSpeedKmh(road)).toBeGreaterThan(31);
    expect(flatSpeedKmh(road)).toBeLessThan(34);
  });
  it('slower uphill, capped downhill, walking floor on walls', () => {
    expect(solveSpeed(0.08, road) * 3.6).toBeLessThan(15);
    expect(solveSpeed(-0.1, road) * 3.6).toBeCloseTo(BIKES.road.maxDescentKmh, 3);
    expect(solveSpeed(0.25, { ...road, riderW: 40 }) * 3.6).toBeCloseTo(3, 3);
  });
  it('e-bike motor assists up to 25 km/h and tapers off', () => {
    const e = BIKES.ebike;
    expect(motorPower(15 / 3.6, 100, e, 'tour')).toBe(140);
    expect(motorPower(15 / 3.6, 300, e, 'turbo')).toBe(250);
    expect(motorPower(24 / 3.6, 100, e, 'tour')).toBeCloseTo(70, 0);
    expect(motorPower(26 / 3.6, 100, e, 'tour')).toBe(0);
    const eb: RiderSettings = { ...road, bike: 'ebike', riderW: 100 };
    expect(solveSpeed(0.06, eb)).toBeGreaterThan(solveSpeed(0.06, { ...eb, bike: 'trekking' }));
  });
  it('gradeChunks merges short segments and clamps grade', () => {
    const prof = [0, 10, 20, 60, 100].map((d, i) => ({ distance: d, elevation: i === 4 ? 100 : 0, lat: 0, lon: 0 }));
    const ch = gradeChunks(prof, 50);
    expect(ch).toEqual([{ len: 60, grade: 0 }, { len: 40, grade: 0.25 }]);
  });
  it('estimateRide: flat 20 km at ~33 km/h ≈ 36 min; e-bike uses battery', () => {
    const flat = Array.from({ length: 201 }, (_, i) => ({ distance: i * 100, elevation: 400, lat: 0, lon: 0 }));
    const est = estimateRide(flat, road);
    expect(est.timeS / 60).toBeGreaterThan(34);
    expect(est.timeS / 60).toBeLessThan(39);
    expect(est.avgRiderW).toBeCloseTo(200, 0);
    expect(est.batteryWh).toBe(0);
    const eb = estimateRide(flat, { ...DEFAULT_RIDER, bike: 'ebike', riderW: 100 });
    expect(eb.batteryWh).toBeGreaterThan(20);
    expect(eb.batteryPct).toBeGreaterThan(4);
  });
  it('powerAtGrade is 0 on steep descents', () => {
    expect(powerAtGrade(-0.08, road)).toBe(0);
    expect(powerAtGrade(0.05, road)).toBeCloseTo(200, 0);
  });
});
