import { describe, it, expect } from 'vitest';
import { parseProfile, getProfile, getSurfaceFallback } from '../openMeteo';
import fixture from './fixtures/openmeteo-profile.json';

const NOON = new Date('2026-06-28T12:00:00Z'); // matches fixture time[12]
const fixtureFetch = () => async () => fixture;

describe('parseProfile', () => {
  it('builds a surface level and pressure levels in AGL, sorted', () => {
    const levels = parseProfile(fixture, NOON);
    expect(levels[0].altM).toBe(0);
    expect(levels[0].tempC).toBe(25); // temperature_2m at 12:00
    expect(levels[0].dewpC).not.toBeNull(); // derived from RH
    const alts = levels.map((l) => l.altM);
    expect(alts).toEqual([...alts].sort((a, b) => a - b));
  });

  it('excludes pressure levels that are below ground (elevation 311 m)', () => {
    const levels = parseProfile(fixture, NOON);
    // 1000 hPa geopotential height is 38 m ASL -> -273 m AGL, must be dropped.
    expect(levels.every((l) => l.altM >= 0)).toBe(true);
    // surface + 950/925/900/850 hPa = 5 levels
    expect(levels.length).toBe(5);
    const at950 = levels.find((l) => l.altM === 183); // 494 - 311
    expect(at950).toBeDefined();
    expect(at950!.tempC).toBe(24);
    expect(at950!.windKt).not.toBeNull();
    expect(at950!.cloudPct).not.toBeNull();
  });

  it('returns an empty array for an empty response', () => {
    expect(parseProfile({}, NOON)).toEqual([]);
  });

  it('returns an empty array for an undefined response (HTTP 204)', () => {
    expect(parseProfile(undefined, NOON)).toEqual([]);
  });
});

describe('getProfile / getSurfaceFallback', () => {
  it('getProfile fetches and parses', async () => {
    const levels = await getProfile({ lat: 39.3, lon: -94.73 }, { fetchJson: fixtureFetch(), now: NOON });
    expect(levels.length).toBe(5);
  });

  it('getSurfaceFallback extracts surface conditions', async () => {
    const s = await getSurfaceFallback({ lat: 39.3, lon: -94.73 }, { fetchJson: fixtureFetch(), now: NOON });
    expect(s.tempC).toBe(25);
    expect(s.rhPct).toBe(84);
    expect(s.windKt).not.toBeNull();
    expect(s.observedAt.toISOString()).toBe('2026-06-28T12:00:00.000Z');
  });
});
