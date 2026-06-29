import { describe, it, expect } from 'vitest';
import { envSaturationHeightM, spreadWidensWithHeight } from '../saturation';
import type { ProfileLevel } from '../types';

const lvl = (altM: number, tempC: number, dewpC: number | null, rhPct: number | null = null): ProfileLevel => ({
  altM,
  tempC,
  dewpC,
  rhPct,
  cloudPct: null,
  source: 'model',
});

describe('envSaturationHeightM', () => {
  it('returns 0 when the surface is already near-saturated (fog / in-cloud)', () => {
    const levels = [lvl(0, 11, 11), lvl(300, 12, 4)];
    expect(envSaturationHeightM(levels)).toBe(0);
  });

  it('interpolates the height where the spread closes between levels', () => {
    // surface spread 6, 300 m spread 0 → spread crosses 1 °C at 5/6 of the way ≈ 250 m
    const levels = [lvl(0, 12, 6), lvl(300, 10, 10)];
    expect(envSaturationHeightM(levels, { spreadThresh: 1 })).toBe(250);
  });

  it('finds an elevated saturated layer above a dry layer (no monotonic assumption)', () => {
    // surface + 200 m are dry (spread 16); 600 m is saturated. The spread crosses 1 °C at 575 m.
    const levels = [lvl(0, 20, 4), lvl(200, 18, 2), lvl(600, 12, 12)];
    expect(envSaturationHeightM(levels)).toBe(575);
  });

  it('returns null when nothing is near-saturated below the cap', () => {
    const levels = [lvl(0, 20, 4), lvl(500, 16, -2), lvl(1000, 12, -6)];
    expect(envSaturationHeightM(levels, { capM: 3000 })).toBeNull();
  });

  it('respects minM to look only ABOVE the surface band', () => {
    const levels = [lvl(0, 11, 11), lvl(250, 18, 17.5, 97)]; // surface saturated, elevated near-sat
    expect(envSaturationHeightM(levels, { minM: 30, capM: 320 })).toBe(250);
  });

  it('uses RH as an alternative saturation trigger', () => {
    const levels = [lvl(0, 20, 5), lvl(400, 15, 9, 96)];
    expect(envSaturationHeightM(levels, { rhThresh: 95 })).toBe(400);
  });
});

describe('spreadWidensWithHeight', () => {
  it('is false when the spread closes with height (normal moistening aloft)', () => {
    expect(spreadWidensWithHeight([lvl(0, 20, 8), lvl(300, 16, 12)])).toBe(false);
  });

  it('is true when the spread widens with height (inversion / drying aloft)', () => {
    expect(spreadWidensWithHeight([lvl(0, 18, 12), lvl(100, 19.5, 6)])).toBe(true);
  });

  it('is false (unflagged) when dew points are unavailable (offline lapse profile)', () => {
    expect(spreadWidensWithHeight([lvl(0, 18, null), lvl(100, 17, null)])).toBe(false);
  });
});
