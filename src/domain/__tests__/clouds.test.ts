import { describe, it, expect } from 'vitest';
import {
  makeCloudLayer,
  ceilingFt,
  estimatedCloudBaseM,
  resolveCloudBase,
} from '../clouds';
import type { Metar } from '../types';

function metar(partial: Partial<Metar>): Metar {
  return {
    icao: 'TEST',
    station: { lat: 0, lon: 0 },
    observedAt: new Date('2026-06-28T12:00:00Z'),
    ageMin: 5,
    wind: { dirDeg: null, variable: false, speedKt: 0, gustKt: null, calm: true },
    visibilityM: 10000,
    cavok: false,
    weather: [],
    clouds: [],
    tempC: null,
    dewpC: null,
    qnhHpa: null,
    raw: '',
    ...partial,
  };
}

describe('makeCloudLayer', () => {
  it('derives metres from feet (2000 ft ≈ 610 m)', () => {
    expect(makeCloudLayer('FEW', 2000).baseM).toBe(610);
    expect(makeCloudLayer('VV', null).baseM).toBeNull();
  });
});

describe('ceilingFt', () => {
  it('uses the lowest BKN/OVC/VV layer, ignoring FEW/SCT', () => {
    const layers = [
      makeCloudLayer('FEW', 2000),
      makeCloudLayer('SCT', 3500),
      makeCloudLayer('BKN', 8000),
    ];
    expect(ceilingFt(layers)).toBe(8000);
  });

  it('returns the VV height when sky is obscured', () => {
    expect(ceilingFt([makeCloudLayer('VV', 300)])).toBe(300);
  });

  it('is null when only FEW/SCT are present', () => {
    expect(ceilingFt([makeCloudLayer('FEW', 2000), makeCloudLayer('SCT', 4000)])).toBeNull();
  });
});

describe('estimatedCloudBaseM', () => {
  it('matches the worked example (23/07 → 2000 m)', () => {
    expect(estimatedCloudBaseM(23, 7)).toBe(2000);
  });

  it('never goes negative', () => {
    expect(estimatedCloudBaseM(5, 9)).toBe(0);
  });
});

describe('resolveCloudBase priority', () => {
  it('1. prefers actual reported layers (lowest base)', () => {
    const r = resolveCloudBase(
      metar({ clouds: [makeCloudLayer('SCT', 3500), makeCloudLayer('BKN', 1200)], tempC: 23, dewpC: 7 }),
    );
    expect(r.kind).toBe('actual');
    expect(r.baseFt).toBe(1200);
  });

  it('2. falls back to CAVOK when no layers', () => {
    const r = resolveCloudBase(metar({ cavok: true, tempC: 23, dewpC: 7 }));
    expect(r.kind).toBe('cavok');
    expect(r.baseFt).toBe(5000);
  });

  it('3. estimates from spread when no layers and no CAVOK', () => {
    const r = resolveCloudBase(metar({ tempC: 23, dewpC: 7 }));
    expect(r.kind).toBe('estimate');
    expect(r.baseM).toBe(2000);
  });

  it('reports none when nothing is available', () => {
    expect(resolveCloudBase(metar({})).kind).toBe('none');
  });
});
