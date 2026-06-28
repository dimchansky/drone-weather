import { describe, it, expect } from 'vitest';
import { haversineKm, initialBearingDeg, compassPoint } from '../geo';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 50, lon: 30 }, { lat: 50, lon: 30 })).toBe(0);
  });

  it('matches a known distance (London ↔ Paris ≈ 344 km)', () => {
    const london = { lat: 51.5074, lon: -0.1278 };
    const paris = { lat: 48.8566, lon: 2.3522 };
    expect(haversineKm(london, paris)).toBeCloseTo(343.9, 0);
  });

  it('is symmetric', () => {
    const a = { lat: 39.3, lon: -94.7 };
    const b = { lat: 38.5, lon: -95.5 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('initialBearingDeg', () => {
  it('points east along the equator', () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 4);
  });

  it('points north along a meridian', () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 4);
  });

  it('returns a value in [0, 360)', () => {
    const b = initialBearingDeg({ lat: 10, lon: 10 }, { lat: -5, lon: -20 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('compassPoint', () => {
  it('maps cardinal bearings', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
  });

  it('rounds to the nearest 16-point sector and wraps 360 to N', () => {
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(200)).toBe('SSW');
  });
});
