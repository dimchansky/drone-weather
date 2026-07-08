import { describe, it, expect } from 'vitest';
import {
  parseProfile,
  getProfile,
  getSurfaceFallback,
  parseModelConditions,
  parseForecastWindow,
  parseTimelineHours,
  getLocationTime,
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

describe('parseTimelineHours', () => {
  const hours = ['11:00', '12:00', '13:00', '14:00', '15:00'].map((h) => `2026-06-28T${h}`);
  const data = {
    hourly: {
      time: hours,
      temperature_2m: [14, 15, 16, 16, 15],
      dew_point_2m: [12, 13, 13, 14, 14],
      relative_humidity_2m: [88, 88, 82, 88, 94],
      wind_speed_10m: [7, 8, 12, 16, 18],
      wind_direction_10m: [240, 240, 250, 270, 270],
      wind_gusts_10m: [12, 14, 20, 26, 30],
      precipitation: [0, 0, 0, 0.3, 0.6],
      // No precipitation_probability series — every hour must carry null, not 0.
      cloud_cover: [10, 20, 60, 90, 100],
      cloud_cover_low: [5, 10, 40, 80, 90],
    },
  };

  it('keeps the full per-hour surface fields from the same payload', () => {
    const tl = parseTimelineHours(data, NOON); // nearest = 12:00 (index 1)
    expect(tl).toHaveLength(4); // only 4 hours remain in the fixture
    expect(tl[0]).toMatchObject({
      tempC: 15,
      dewpC: 13,
      rhPct: 88,
      windDirDeg: 240,
      windKt: 8,
      gustKt: 14,
      precipMm: 0,
      cloudCoverPct: 20,
      cloudCoverLowPct: 10,
    });
    expect(tl[0].time.toISOString()).toBe('2026-06-28T12:00:00.000Z');
    expect(tl[3].precipMm).toBe(0.6);
  });

  it('missing probability series → null cells (never fabricated)', () => {
    const tl = parseTimelineHours(data, NOON);
    expect(tl.every((h) => h.precipProb === null)).toBe(true);
  });

  it('caps at the requested horizon', () => {
    const tl = parseTimelineHours(data, NOON, 2);
    expect(tl).toHaveLength(2);
  });

  it('is empty for an undefined response', () => {
    expect(parseTimelineHours(undefined, NOON)).toEqual([]);
  });
});

describe('getLocationTime', () => {
  it('reads utc_offset_seconds + timezone from the model (timezone=auto)', async () => {
    const fetchJson = async () => ({ utc_offset_seconds: 25200, timezone: 'Asia/Ho_Chi_Minh' });
    const lt = await getLocationTime({ lat: 10.8, lon: 106.7 }, { fetchJson });
    expect(lt).toEqual({ utcOffsetSeconds: 25200, timezone: 'Asia/Ho_Chi_Minh', source: 'open-meteo' });
  });

  it('falls back to the device offset when the model timezone is unavailable', async () => {
    const fetchJson = async () => ({}); // no utc_offset_seconds
    const now = new Date('2026-07-01T12:00:00Z');
    const lt = await getLocationTime({ lat: 0, lon: 0 }, { fetchJson, now });
    expect(lt.source).toBe('device-fallback');
    expect(lt.utcOffsetSeconds).toBe(-now.getTimezoneOffset() * 60);
  });

  it('falls back on a fetch error', async () => {
    const fetchJson = async () => {
      throw new Error('network');
    };
    const lt = await getLocationTime({ lat: 0, lon: 0 }, { fetchJson });
    expect(lt.source).toBe('device-fallback');
  });
});
