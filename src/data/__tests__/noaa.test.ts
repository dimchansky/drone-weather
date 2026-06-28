import { describe, it, expect } from 'vitest';
import { getMetar, getTaf, nearestStations } from '../noaa';
import metarKmci from './fixtures/metar-kmci.json';
import tafKmci from './fixtures/taf-kmci.json';
import metarBbox from './fixtures/metar-bbox.json';

const KC: { lat: number; lon: number } = { lat: 39.2975, lon: -94.7309 };
const fixtureFetch = (data: unknown) => async () => data;

describe('getMetar', () => {
  it('parses NOAA JSON into a Metar and prefers obsTime for age', async () => {
    const obsTime = (metarKmci as { obsTime: number }[])[0].obsTime;
    const now = new Date(obsTime * 1000 + 10 * 60_000); // 10 minutes after observation
    const m = await getMetar('KMCI', { fetchJson: fixtureFetch(metarKmci), now });

    expect(m.icao).toBe('KMCI');
    expect(m.station).toEqual({ lat: KC.lat, lon: KC.lon });
    expect(m.observedAt.getTime()).toBe(obsTime * 1000);
    expect(m.ageMin).toBe(10);
    expect(m.wind.speedKt).toBeGreaterThan(0);
    expect(m.tempC).not.toBeNull();
    expect(m.raw).toContain('KMCI');
  });

  it('throws when the station has no METAR', async () => {
    await expect(getMetar('ZZZZ', { fetchJson: fixtureFetch([]) })).rejects.toThrow(/No METAR/);
  });
});

describe('getTaf', () => {
  it('parses a TAF', async () => {
    const t = await getTaf('KMCI', { fetchJson: fixtureFetch(tafKmci) });
    expect(t).not.toBeNull();
    expect(t!.icao).toBe('KMCI');
    expect(t!.raw).toContain('TAF');
    expect(t!.validTo.getTime()).toBeGreaterThan(t!.validFrom.getTime());
  });

  it('returns null when no TAF is available', async () => {
    expect(await getTaf('ZZZZ', { fetchJson: fixtureFetch([]) })).toBeNull();
  });
});

describe('nearestStations', () => {
  it('returns stations sorted by distance, nearest first', async () => {
    const list = await nearestStations(KC, 50, { fetchJson: fixtureFetch(metarBbox), now: new Date() });
    expect(list.length).toBeGreaterThan(1);
    // KMCI is at the query point, so it must be the nearest.
    expect(list[0].metar.icao).toBe('KMCI');
    expect(list[0].distanceKm).toBeLessThan(5);
    const distances = list.map((s) => s.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(list[0].bearingDeg).toBeGreaterThanOrEqual(0);
    expect(list[0].bearingDeg).toBeLessThan(360);
  });

  it('returns an empty list when the response is not an array', async () => {
    expect(await nearestStations(KC, 50, { fetchJson: fixtureFetch({}) })).toEqual([]);
  });
});

describe('empty (HTTP 204) responses — no station in the bbox', () => {
  // The proxy/cache resolves an empty 204 body to `undefined`; adapters must not crash.
  const noContent = async () => undefined;

  it('nearestStations returns [] so the caller can fall back to model data', async () => {
    expect(await nearestStations(KC, 80, { fetchJson: noContent })).toEqual([]);
  });

  it('getTaf returns null', async () => {
    expect(await getTaf('KMCI', { fetchJson: noContent })).toBeNull();
  });

  it('getMetar throws a clear error rather than a JSON parse error', async () => {
    await expect(getMetar('KMCI', { fetchJson: noContent })).rejects.toThrow(/No METAR/);
  });
});
