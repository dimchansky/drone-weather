import { describe, it, expect } from 'vitest';
import { sunArcProgress } from '../sunArc';

const SUNRISE = new Date('2026-06-28T02:00:00Z');
const SUNSET = new Date('2026-06-28T19:00:00Z');
const at = (iso: string) => new Date(iso);

describe('sunArcProgress', () => {
  it('is 0 at sunrise', () => {
    expect(sunArcProgress(SUNRISE, SUNRISE, SUNSET)).toBe(0);
  });

  it('is 1 at sunset', () => {
    expect(sunArcProgress(SUNSET, SUNRISE, SUNSET)).toBe(1);
  });

  it('is 0.5 at the midpoint', () => {
    expect(sunArcProgress(at('2026-06-28T10:30:00Z'), SUNRISE, SUNSET)).toBeCloseTo(0.5);
  });

  it('is null before sunrise and after sunset', () => {
    expect(sunArcProgress(at('2026-06-28T01:00:00Z'), SUNRISE, SUNSET)).toBeNull();
    expect(sunArcProgress(at('2026-06-28T21:00:00Z'), SUNRISE, SUNSET)).toBeNull();
  });

  it('is null when either time is missing (polar day/night)', () => {
    expect(sunArcProgress(at('2026-06-28T12:00:00Z'), null, SUNSET)).toBeNull();
    expect(sunArcProgress(at('2026-06-28T12:00:00Z'), SUNRISE, null)).toBeNull();
    expect(sunArcProgress(at('2026-06-28T12:00:00Z'), null, null)).toBeNull();
  });
});
