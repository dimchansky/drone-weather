// NOAA aviationweather.gov adapter (via the Cloudflare Worker proxy).
// Provides METAR, TAF and nearest-station discovery (bbox). See docs/spec.md §6.2.

import type { Coord, Metar, Taf } from '../domain/types';
import { parseMetar } from '../domain/metar';
import { haversineKm, initialBearingDeg } from '../domain/geo';
import { cachedFetchJson } from './cache';

const PROXY_BASE = ((import.meta.env.VITE_METAR_PROXY_URL as string | undefined) ?? '').replace(
  /\/+$/,
  '',
);
const METAR_TTL_MS = 5 * 60 * 1000;

/** Shape of the NOAA JSON we rely on (other fields are ignored). */
interface NoaaMetar {
  icaoId: string;
  rawOb?: string;
  obsTime?: number; // unix seconds
  lat?: number;
  lon?: number;
  elev?: number;
  name?: string;
}
interface NoaaTaf {
  icaoId: string;
  rawTAF?: string;
  issueTime?: string;
  bulletinTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
}

export interface FetchDeps {
  /** Inject for tests; defaults to a cached fetch through the proxy. */
  fetchJson?: (url: string) => Promise<unknown>;
  now?: Date;
  baseUrl?: string;
  /** Bypass the cache TTL and revalidate (Refresh). */
  force?: boolean;
}

const fetcher = (deps: FetchDeps) =>
  deps.fetchJson ?? ((url: string) => cachedFetchJson(url, METAR_TTL_MS, { force: deps.force }));

function buildMetar(j: NoaaMetar, now: Date): Metar {
  const metar = parseMetar(j.rawOb ?? '', {
    now,
    icao: j.icaoId,
    station: j.lat != null && j.lon != null ? { lat: j.lat, lon: j.lon } : undefined,
    stationName: j.name,
    elevationM: j.elev,
  });
  // NOAA's obsTime is authoritative — prefer it over time parsed from the raw text.
  if (typeof j.obsTime === 'number') {
    metar.observedAt = new Date(j.obsTime * 1000);
    metar.ageMin = Math.max(0, Math.round((now.getTime() - metar.observedAt.getTime()) / 60000));
  }
  return metar;
}

export async function getMetar(icao: string, deps: FetchDeps = {}): Promise<Metar> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  const base = deps.baseUrl ?? PROXY_BASE;
  const arr = (await fj(`${base}/metar?ids=${encodeURIComponent(icao)}`)) as NoaaMetar[];
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`No METAR for ${icao}`);
  return buildMetar(arr[0], now);
}

export async function getTaf(icao: string, deps: FetchDeps = {}): Promise<Taf | null> {
  const fj = fetcher(deps);
  const base = deps.baseUrl ?? PROXY_BASE;
  const arr = (await fj(`${base}/taf?ids=${encodeURIComponent(icao)}`)) as NoaaTaf[];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const j = arr[0];
  if (!j.rawTAF) return null;
  return {
    icao: j.icaoId,
    issuedAt: new Date(j.issueTime ?? j.bulletinTime ?? 0),
    validFrom: new Date((j.validTimeFrom ?? 0) * 1000),
    validTo: new Date((j.validTimeTo ?? 0) * 1000),
    raw: j.rawTAF,
  };
}

export interface NearbyStation {
  metar: Metar;
  distanceKm: number;
  bearingDeg: number;
}

/**
 * Find nearby reporting stations by querying a bounding box around `at` and sorting by
 * great-circle distance (nearest first). No shipped airport DB required.
 */
export async function nearestStations(
  at: Coord,
  radiusKm = 50,
  deps: FetchDeps = {},
): Promise<NearbyStation[]> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  const base = deps.baseUrl ?? PROXY_BASE;

  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.1, Math.cos((at.lat * Math.PI) / 180)));
  const bbox = [
    (at.lat - latDelta).toFixed(4),
    (at.lon - lonDelta).toFixed(4),
    (at.lat + latDelta).toFixed(4),
    (at.lon + lonDelta).toFixed(4),
  ].join(',');

  const arr = (await fj(`${base}/metar?bbox=${bbox}`)) as NoaaMetar[];
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((j) => typeof j.lat === 'number' && typeof j.lon === 'number' && j.rawOb)
    .map((j) => {
      const metar = buildMetar(j, now);
      return {
        metar,
        distanceKm: haversineKm(at, metar.station),
        bearingDeg: initialBearingDeg(at, metar.station),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
