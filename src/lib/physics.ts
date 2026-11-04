// Cycling power model — powers the "your pace" times (#5), watt output (#4)
// and e-bike battery estimates.
//
//   P_wheel = v · ( m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v² )
//   P_wheel = η · (P_rider + P_motor)
//
// Everything here is pure and unit-tested.

import type { ElevationPoint } from '../types';

export type BikeType = 'road' | 'gravel' | 'trekking' | 'mtb' | 'ebike' | 'speed-pedelec';

export interface BikeSpec {
  label: string;
  crr: number;
  cda: number;
  /** Typical bike mass (kg). */
  massKg: number;
  /** Max safe descending speed (km/h). */
  maxDescentKmh: number;
  /** Motor assist cut-off (km/h); 0 = no motor. */
  assistKmh: number;
  /** Max continuous motor power (W). */
  motorW: number;
}

export const BIKES: Record<BikeType, BikeSpec> = {
  road:            { label: 'Road',           crr: 0.004, cda: 0.32, massKg: 8,  maxDescentKmh: 55, assistKmh: 0,  motorW: 0   },
  gravel:          { label: 'Gravel',         crr: 0.005, cda: 0.38, massKg: 10, maxDescentKmh: 50, assistKmh: 0,  motorW: 0   },
  trekking:        { label: 'Trekking/City',  crr: 0.006, cda: 0.45, massKg: 15, maxDescentKmh: 40, assistKmh: 0,  motorW: 0   },
  mtb:             { label: 'MTB',            crr: 0.010, cda: 0.50, massKg: 13, maxDescentKmh: 40, assistKmh: 0,  motorW: 0   },
  ebike:           { label: 'E-bike 25',      crr: 0.007, cda: 0.50, massKg: 24, maxDescentKmh: 40, assistKmh: 25, motorW: 250 },
  'speed-pedelec': { label: 'S-Pedelec 45',   crr: 0.006, cda: 0.45, massKg: 27, maxDescentKmh: 50, assistKmh: 45, motorW: 500 },
};

export type AssistLevel = 'eco' | 'tour' | 'sport' | 'turbo';
/** Motor power as a multiple of rider power (typical Bosch/Shimano values). */
export const ASSIST_FACTOR: Record<AssistLevel, number> = { eco: 0.6, tour: 1.4, sport: 2.2, turbo: 3.4 };

export interface RiderSettings {
  bike: BikeType;
  riderKg: number;
  /** Sustained rider power on the pedals (W). */
  riderW: number;
  assist: AssistLevel;
  batteryWh: number;
}

export const DEFAULT_RIDER: RiderSettings = {
  bike: 'trekking',
  riderKg: 75,
  riderW: 130,
  assist: 'tour',
  batteryWh: 500,
};

export const PACE_PRESETS: { label: string; riderW: number }[] = [
  { label: 'Leisure', riderW: 80  },
  { label: 'Normal',  riderW: 130 },
  { label: 'Sport',   riderW: 190 },
  { label: 'Racer',   riderW: 260 },
];

const G = 9.81;
const RHO = 1.2;
const ETA = 0.96;          // drivetrain efficiency
const MOTOR_EFF = 0.8;     // battery → motor shaft
const HUMAN_EFF = 0.24;    // metabolic efficiency
const MIN_V = 3 / 3.6;     // walking pace floor on brutal climbs

/** Power at the wheel (W) needed to hold speed v (m/s) on grade (rise/run). */
export function wheelPower(v: number, grade: number, massKg: number, spec: Pick<BikeSpec, 'crr' | 'cda'>): number {
  const theta = Math.atan(grade);
  const f = massKg * G * (Math.sin(theta) + spec.crr * Math.cos(theta)) + 0.5 * RHO * spec.cda * v * v;
  return f * v;
}

/** Motor power (W) at speed v given rider power, with a linear taper over the last 2 km/h. */
export function motorPower(v: number, riderW: number, spec: BikeSpec, assist: AssistLevel): number {
  if (spec.motorW <= 0 || spec.assistKmh <= 0) return 0;
  const kmh = v * 3.6;
  if (kmh >= spec.assistKmh) return 0;
  const full = Math.min(spec.motorW, ASSIST_FACTOR[assist] * riderW);
  const taperStart = spec.assistKmh - 2;
  return kmh <= taperStart ? full : full * (spec.assistKmh - kmh) / 2;
}

/** Steady-state speed (m/s) on a grade, solved by bisection. */
export function solveSpeed(grade: number, s: RiderSettings): number {
  const spec = BIKES[s.bike];
  const mass = s.riderKg + spec.massKg;
  const vMax = spec.maxDescentKmh / 3.6;
  const surplus = (v: number) => ETA * (s.riderW + motorPower(v, s.riderW, spec, s.assist)) - wheelPower(v, grade, mass, spec);
  if (surplus(vMax) >= 0) return vMax;          // capped (fast descent)
  if (surplus(MIN_V) <= 0) return MIN_V;        // too steep — walking pace
  let lo = MIN_V, hi = vMax;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (surplus(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Flat-ground cruising speed (km/h) for these settings — shown next to pace presets. */
export function flatSpeedKmh(s: RiderSettings): number {
  return solveSpeed(0, s) * 3.6;
}

export interface RideEstimate {
  timeS: number;
  avgKmh: number;
  /** Average rider power over moving time (W), counting coasting as 0. */
  avgRiderW: number;
  riderKJ: number;
  kcal: number;
  /** Battery energy used (Wh); 0 for non-e-bikes. */
  batteryWh: number;
  /** Percentage of configured battery used (may exceed 100). */
  batteryPct: number;
}

/** Aggregate a profile into chunks of at least `minLen` metres to tame elevation noise. */
export function gradeChunks(profile: ElevationPoint[], minLen = 50): { len: number; grade: number }[] {
  const out: { len: number; grade: number }[] = [];
  if (profile.length < 2) return out;
  let start = profile[0];
  for (let i = 1; i < profile.length; i++) {
    const p = profile[i];
    const len = p.distance - start.distance;
    if (len >= minLen || i === profile.length - 1) {
      if (len > 0) {
        const grade = Math.max(-0.25, Math.min(0.25, (p.elevation - start.elevation) / len));
        out.push({ len, grade });
      }
      start = p;
    }
  }
  return out;
}

export function estimateRide(profile: ElevationPoint[], s: RiderSettings): RideEstimate {
  const spec = BIKES[s.bike];
  const mass = s.riderKg + spec.massKg;
  let t = 0, dist = 0, riderJ = 0, motorJ = 0;
  for (const { len, grade } of gradeChunks(profile)) {
    const v = solveSpeed(grade, s);
    const dt = len / v;
    const motor = motorPower(v, s.riderW, spec, s.assist);
    // Rider only pushes as much as needed (e.g. less when speed-capped downhill)
    const need = Math.max(0, wheelPower(v, grade, mass, spec) / ETA);
    const rider = Math.max(0, Math.min(s.riderW, need - motor));
    const usedMotor = Math.max(0, Math.min(motor, need));
    t += dt; dist += len;
    riderJ += rider * dt;
    motorJ += usedMotor * dt;
  }
  const batteryWh = motorJ / 3600 / MOTOR_EFF;
  return {
    timeS: t,
    avgKmh: t > 0 ? (dist / t) * 3.6 : 0,
    avgRiderW: t > 0 ? riderJ / t : 0,
    riderKJ: riderJ / 1000,
    kcal: riderJ / 4184 / HUMAN_EFF,
    batteryWh,
    batteryPct: spec.motorW > 0 && s.batteryWh > 0 ? (batteryWh / s.batteryWh) * 100 : 0,
  };
}

/** Power the rider needs (W) to hold their flat-ground speed at a given grade. Used for chart tooltips. */
export function powerAtGrade(grade: number, s: RiderSettings): number {
  const spec = BIKES[s.bike];
  const v = solveSpeed(grade, s);
  const need = wheelPower(v, grade, s.riderKg + spec.massKg, spec) / ETA;
  return Math.max(0, need - motorPower(v, s.riderW, spec, s.assist));
}
