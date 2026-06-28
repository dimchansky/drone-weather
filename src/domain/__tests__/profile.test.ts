import { describe, it, expect } from 'vitest';
import { lapseProfile, mergeModelProfile, DEFAULT_ALTS_M } from '../profile';
import type { ProfileLevel } from '../types';

describe('lapseProfile', () => {
  it('matches the worked example (surface 23 °C)', () => {
    const p = lapseProfile(23);
    const at = (alt: number) => p.levels.find((l) => l.altM === alt)!.tempC;
    expect(at(0)).toBeCloseTo(23.0, 4);
    expect(at(50)).toBeCloseTo(22.675, 4);
    expect(at(120)).toBeCloseTo(22.22, 4);
    expect(at(300)).toBeCloseTo(21.05, 4);
    expect(at(500)).toBeCloseTo(19.75, 4);
    expect(at(1000)).toBeCloseTo(16.5, 4);
  });

  it('uses the default altitude grid and leaves moisture null', () => {
    const p = lapseProfile(10);
    expect(p.levels.map((l) => l.altM)).toEqual(DEFAULT_ALTS_M);
    expect(p.source).toBe('lapse');
    expect(p.levels.every((l) => l.dewpC === null && l.rhPct === null)).toBe(true);
  });
});

describe('mergeModelProfile', () => {
  const model: ProfileLevel[] = [
    { altM: 0, tempC: 20, dewpC: 15, rhPct: 74, windDirDeg: 350, windKt: 10, cloudPct: 10, source: 'model' },
    { altM: 100, tempC: 19, dewpC: 14, rhPct: 72, windDirDeg: 10, windKt: 14, cloudPct: 20, source: 'model' },
    { altM: 1000, tempC: 10, dewpC: 8, rhPct: 80, windDirDeg: 20, windKt: 25, cloudPct: 60, source: 'model' },
  ];

  it('interpolates linearly between levels', () => {
    const p = mergeModelProfile(model, [50, 120]);
    const at = (alt: number) => p.levels.find((l) => l.altM === alt)!;
    expect(at(50).tempC).toBeCloseTo(19.5, 4); // halfway 20->19
    expect(at(120).tempC).toBeCloseTo(18.8, 4); // 19 - 0.0222*9
    expect(p.source).toBe('model');
  });

  it('interpolates wind direction along the shortest arc (350° → 10° crosses N)', () => {
    const p = mergeModelProfile(model, [50]);
    // midpoint of 350 and 10 is 0/360
    expect(p.levels[0].windDirDeg).toBeCloseTo(0, 2);
  });

  it('clamps to the nearest level outside the model range', () => {
    const p = mergeModelProfile(model, [5000]);
    expect(p.levels[0].tempC).toBe(10); // clamped to top level
  });

  it('keeps moisture populated from the model', () => {
    const p = mergeModelProfile(model, [50]);
    expect(p.levels[0].dewpC).toBeCloseTo(14.5, 4);
    expect(p.levels[0].rhPct).toBeCloseTo(73, 4);
  });
});
