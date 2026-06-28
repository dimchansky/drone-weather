// Live smoke test against the real Worker + Open-Meteo. Skipped by default (and in CI);
// run locally with:  LIVE=1 npx vitest run src/data/__tests__/live.test.ts
import { describe, it, expect } from 'vitest';
import { getMetar, getTaf, nearestStations } from '../noaa';
import { getProfile } from '../openMeteo';

const baseUrl = 'https://drone-weather-metar-proxy.dimchansky.workers.dev';
const KC = { lat: 39.2975, lon: -94.7309 };

// Read the LIVE flag without depending on @types/node (process isn't typed here).
const LIVE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.LIVE;

describe.skipIf(!LIVE)('live data layer', () => {
  it('fetches and parses a real METAR', async () => {
    const m = await getMetar('KMCI', { baseUrl });
    expect(m.icao).toBe('KMCI');
    expect(m.tempC).not.toBeNull();
    expect(m.raw).toContain('KMCI');
  });

  it('fetches a real TAF', async () => {
    const t = await getTaf('KMCI', { baseUrl });
    expect(t?.raw).toContain('TAF');
  });

  it('finds nearby stations via bbox', async () => {
    const list = await nearestStations(KC, 50, { baseUrl });
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].distanceKm).toBeLessThan(60);
  });

  it('fetches a real vertical profile from Open-Meteo', async () => {
    const levels = await getProfile(KC);
    expect(levels.length).toBeGreaterThan(1);
    expect(levels[0].altM).toBe(0);
  });
});
