import { describe, it, expect } from 'vitest';
import {
  parseProfile,
  getProfile,
  getSurfaceFallback,
  parseModelConditions,
  parseForecastWindow,
} from '../openMeteo';
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

describe('parseModelConditions', () => {
  it('extracts surface model conditions at the nearest hour', () => {
    const data = {
      elevation: 100,
      hourly: {
        time: ['2026-06-28T11:00', '2026-06-28T12:00'],
        temperature_2m: [14, 15],
        dew_point_2m: [13, 14],
        relative_humidity_2m: [90, 94],
        wind_speed_10m: [3, 2],
        precipitation: [0, 0.4],
        precipitation_probability: [20, 80],
        cloud_cover: [10, 90],
        cloud_cover_low: [5, 80],
      },
    };
    expect(parseModelConditions(data, NOON)).toEqual({
      tempC2m: 15,
      dewp2m: 14,
      rh2m: 94,
      windKt: 2,
      precipMm: 0.4,
      precipProb: 80,
      cloudCoverPct: 90,
      cloudCoverLowPct: 80,
    });
  });

  it('returns all-null for empty/undefined data', () => {
    expect(parseModelConditions(undefined, NOON).precipMm).toBeNull();
  });
});

describe('parseForecastWindow', () => {
  const data = {
    hourly: {
      time: ['2026-06-28T11:00', '2026-06-28T12:00', '2026-06-28T13:00', '2026-06-28T14:00', '2026-06-28T15:00'],
      wind_speed_10m: [7, 8, 12, 16, 18],
      wind_gusts_10m: [12, 14, 20, 26, 30],
      precipitation: [0, 0, 0, 0.3, 0.6],
      precipitation_probability: [10, 20, 40, 70, 80],
    },
  };

  it('returns the nearest hour + the next 3, including gusts', () => {
    const w = parseForecastWindow(data, NOON); // nearest = 12:00 (index 1)
    expect(w).toHaveLength(4);
    expect(w[0].time.toISOString()).toBe('2026-06-28T12:00:00.000Z');
    expect(w[0].windKt).toBe(8);
    expect(w[0].gustKt).toBe(14);
    expect(w[3].precipProb).toBe(80);
  });

  it('is empty for an undefined response', () => {
    expect(parseForecastWindow(undefined, NOON)).toEqual([]);
  });
});
