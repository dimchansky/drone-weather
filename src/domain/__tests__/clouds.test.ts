import { describe, it, expect } from 'vitest';
import {
  makeCloudLayer,
  ceilingFt,
  estimatedCloudBaseM,
  resolveCloudBase,
} from '../clouds';
import type { Metar, ProfileLevel, VerticalProfile } from '../types';

const modelProfile = (cloudByAlt: Record<number, number | null>): VerticalProfile => {
  const levels: ProfileLevel[] = Object.entries(cloudByAlt).map(([altM, cloudPct]) => ({
    altM: Number(altM),
    tempC: 15,
    dewpC: null,
    rhPct: null,
    cloudPct,
    source: 'model',
  }));
  levels.sort((a, b) => a.altM - b.altM);
  return { levels, source: 'model', note: '' };
};

/** Model profile from explicit per-level fields (for inversion / saturation cases). */
const lvlProfile = (rows: Partial<ProfileLevel>[]): VerticalProfile => {
  const levels: ProfileLevel[] = rows
    .map((r) => ({ altM: 0, tempC: 15, dewpC: null, rhPct: null, cloudPct: null, source: 'model' as const, ...r }))
    .sort((a, b) => a.altM - b.altM);
  return { levels, source: 'model', note: '' };
};

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

  it('3. uses the model cloud profile (lowest level with significant cloud) before estimating', () => {
    const profile = modelProfile({ 0: 0, 450: 10, 690: 70, 930: 90 });
    const r = resolveCloudBase(metar({ tempC: 23, dewpC: 7 }), profile);
    expect(r.kind).toBe('model');
    expect(r.baseM).toBe(690); // first level ≥ 50% cloud
  });

  it('4. estimates from a moderate spread when no layers/CAVOK/model cloud (low, meaningful base)', () => {
    const r = resolveCloudBase(metar({ tempC: 18, dewpC: 12 })); // spread 6 → 750 m
    expect(r.kind).toBe('estimate');
    expect(r.baseM).toBe(750);
    expect(r.unreliable).toBeFalsy();
  });

  it('keeps a low estimate when the surface is near-saturated (small spread)', () => {
    const r = resolveCloudBase(metar({ tempC: 12, dewpC: 11 })); // spread 1 → 125 m
    expect(r.kind).toBe('estimate');
    expect(r.baseM).toBe(125);
  });

  it('GATES a large dry spread to none-low (clear / high base), even without a model', () => {
    const r = resolveCloudBase(metar({ tempC: 30, dewpC: -5 })); // spread 35 → 4375 m
    expect(r.kind).toBe('none-low');
    expect(r.note).toMatch(/no significant low cloud/i);
  });

  it('gates to none-low when the model shows no low cloud and the spread is large', () => {
    const profile = modelProfile({ 0: 0, 450: 10, 690: 20 }); // max low cloud 20% < 25%
    const r = resolveCloudBase(metar({ tempC: 23, dewpC: 7 }), profile); // spread 16
    expect(r.kind).toBe('none-low');
  });

  it('flags the spread-based estimate as unreliable through an inversion', () => {
    const profile = lvlProfile([
      { altM: 0, tempC: 18, dewpC: 12 },
      { altM: 100, tempC: 19.5, dewpC: 6 }, // warmer + drier aloft = inversion, spread widens
    ]);
    const r = resolveCloudBase(metar({ tempC: 18, dewpC: 12 }), profile); // spread 6 → 750 m
    expect(r.kind).toBe('estimate');
    expect(r.unreliable).toBe(true);
    expect(r.note).toMatch(/inversion|unreliable/i);
  });

  it('treats an explicit sky-clear report (CLR/NCD) as no significant low cloud, not an estimate', () => {
    const r = resolveCloudBase(metar({ clouds: [makeCloudLayer('CLR', null)], tempC: 25, dewpC: 22 }));
    expect(r.kind).toBe('none-low');
    expect(r.baseM).toBeNull();
    expect(r.note).toMatch(/clear/i);
  });

  it('actual layers still win over a model profile', () => {
    const profile = modelProfile({ 0: 0, 690: 90 });
    const r = resolveCloudBase(metar({ clouds: [makeCloudLayer('BKN', 1200)] }), profile);
    expect(r.kind).toBe('actual');
  });

  it('reports none when nothing is available', () => {
    expect(resolveCloudBase(metar({})).kind).toBe('none');
  });
});
