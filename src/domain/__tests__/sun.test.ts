import { describe, it, expect } from 'vitest';
import { sunTimes, sunPosition, daylight, daylightSeverity } from '../sun';

const min = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60000;

describe('sunTimes — equator at equinox', () => {
  // At the equator on an equinox the day is ~12 h and solar noon is near 12:00 UTC at lon 0
  // (offset only by the equation of time). This is a robust anchor independent of any library.
  const t = sunTimes(new Date('2026-03-20T12:00:00Z'), { lat: 0, lon: 0 });

  it('has a ~12 h day (a touch longer from refraction)', () => {
    const dayLen = min(t.sunset!, t.sunrise!);
    expect(dayLen).toBeGreaterThan(710);
    expect(dayLen).toBeLessThan(740);
  });

  it('puts sunrise near 06:00 UTC and solar noon near 12:00 UTC', () => {
    expect([5, 6]).toContain(t.sunrise!.getUTCHours());
    expect([11, 12]).toContain(t.solarNoon.getUTCHours());
  });

  it('orders twilight → golden → sunrise → noon → sunset → golden → twilight', () => {
    const order = [
      t.civilDawn!,
      t.sunrise!,
      t.goldenMorningEnd!,
      t.solarNoon,
      t.goldenEveningStart!,
      t.sunset!,
      t.civilDusk!,
    ].map((d) => d.getTime());
    const sorted = [...order].sort((a, b) => a - b);
    expect(order).toEqual(sorted);
  });
});

describe('sunPosition', () => {
  it('is near the zenith at the equator at local solar noon on the equinox', () => {
    const alt = sunPosition(new Date('2026-03-20T12:07:00Z'), { lat: 0, lon: 0 }).altitudeDeg;
    expect(alt).toBeGreaterThan(85);
  });
});

describe('polar day / night', () => {
  it('returns null times and polar="day" above the Arctic circle at the June solstice', () => {
    const t = sunTimes(new Date('2026-06-21T12:00:00Z'), { lat: 80, lon: 0 });
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
    expect(daylight(new Date('2026-06-21T12:00:00Z'), { lat: 80, lon: 0 }).polar).toBe('day');
  });

  it('returns polar="night" above the Arctic circle at the December solstice', () => {
    const d = daylight(new Date('2026-12-21T12:00:00Z'), { lat: 80, lon: 0 });
    expect(d.polar).toBe('night');
    expect(d.phase).toBe('night');
  });
});

describe('daylight() phase + remaining', () => {
  const eq = { lat: 0, lon: 0 };

  it('is day at solar noon and night at local midnight (equator, equinox)', () => {
    expect(daylight(new Date('2026-03-20T12:07:00Z'), eq).phase).toBe('day');
    expect(daylight(new Date('2026-03-20T00:00:00Z'), eq).phase).toBe('night');
  });

  it('reports positive daylight remaining before sunset and null after', () => {
    const before = daylight(new Date('2026-03-20T15:00:00Z'), eq);
    expect(before.daylightRemainingMin).toBeGreaterThan(0);
    const after = daylight(new Date('2026-03-20T20:00:00Z'), eq);
    expect(after.daylightRemainingMin).toBeNull();
  });

  it('points nextSunrise at the following day once past an evening sunset', () => {
    const d = daylight(new Date('2026-03-20T20:00:00Z'), eq); // after sunset, evening
    expect(d.nextSunrise).not.toBeNull();
    expect(d.nextSunrise!.getUTCDate()).toBe(21);
  });
});

describe('daylightSeverity (advisory, never NO-FLY)', () => {
  it('is GOOD in daylight/golden hour and CAUTION in twilight/night', () => {
    expect(daylightSeverity('day')).toBe('GOOD');
    expect(daylightSeverity('golden')).toBe('GOOD');
    expect(daylightSeverity('civilTwilight')).toBe('CAUTION');
    expect(daylightSeverity('night')).toBe('CAUTION');
  });
});

describe('real-city sanity — Vilnius, high summer', () => {
  it('sets in the evening (UTC+3 local ≈ 22:00 → ~19 UTC)', () => {
    const t = sunTimes(new Date('2026-07-01T12:00:00Z'), { lat: 54.6649, lon: 25.2167 });
    expect(t.sunset!.getUTCHours()).toBeGreaterThanOrEqual(18);
    expect(t.sunset!.getUTCHours()).toBeLessThanOrEqual(20);
  });
});
