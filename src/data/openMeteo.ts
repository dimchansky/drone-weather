// Open-Meteo adapter (browser-direct: CORS-enabled, keyless). Supplies the vertical
// profile from pressure-level data, plus a surface fallback when no METAR is nearby.
// See docs/spec.md §6.3.

import type { Coord, ProfileLevel } from '../domain/types';
import { dewPointFromRH } from '../domain/humidity';
import { cachedFetchJson } from './cache';

const OM_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_TTL_MS = 30 * 60 * 1000;
// Pressure levels covering roughly the low-altitude drone envelope (surface–~1.5 km).
const LEVELS = [1000, 950, 925, 900, 850] as const;

const SURFACE_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
];

function hourlyVars(): string {
  const perLevel = LEVELS.flatMap((l) => [
    `temperature_${l}hPa`,
    `relative_humidity_${l}hPa`,
    `wind_speed_${l}hPa`,
    `wind_direction_${l}hPa`,
    `geopotential_height_${l}hPa`,
    `cloud_cover_${l}hPa`,
  ]);
  return [...SURFACE_VARS, ...perLevel].join(',');
}

function buildUrl(at: Coord): string {
  return (
    `${OM_BASE}?latitude=${at.lat}&longitude=${at.lon}` +
    `&hourly=${hourlyVars()}&wind_speed_unit=kn&forecast_days=1&timezone=GMT`
  );
}

interface OpenMeteoResponse {
  elevation?: number;
  hourly?: Record<string, unknown>;
}

/** Index of the hourly entry closest to `now` (times are GMT, no zone suffix). */
function nearestHourIndex(times: string[], now: Date): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(`${times[i]}Z`).getTime() - now.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/** Reader for a numeric hourly series at index `i`. */
function reader(hourly: Record<string, unknown>, i: number) {
  return (key: string): number | null => {
    const arr = hourly[key] as (number | null)[] | undefined;
    return arr && arr[i] != null ? (arr[i] as number) : null;
  };
}

function timesOf(data: OpenMeteoResponse | undefined): string[] | null {
  const t = data?.hourly?.time;
  return Array.isArray(t) && t.length ? (t as string[]) : null;
}

/** Parse an Open-Meteo response into raw model levels (AGL), sorted ascending. */
export function parseProfile(data: OpenMeteoResponse | undefined, now: Date): ProfileLevel[] {
  const times = timesOf(data);
  if (!times || !data?.hourly) return [];
  const i = nearestHourIndex(times, now);
  const val = reader(data.hourly, i);
  const elev = typeof data.elevation === 'number' ? data.elevation : 0;
  const levels: ProfileLevel[] = [];

  // Surface (0 m AGL) from 2 m / 10 m fields.
  const t2 = val('temperature_2m');
  if (t2 != null) {
    const rh = val('relative_humidity_2m');
    levels.push({
      altM: 0,
      tempC: t2,
      dewpC: rh != null ? dewPointFromRH(t2, rh) : null,
      rhPct: rh,
      windDirDeg: val('wind_direction_10m'),
      windKt: val('wind_speed_10m'),
      cloudPct: null,
      source: 'model',
    });
  }

  for (const l of LEVELS) {
    const geo = val(`geopotential_height_${l}hPa`);
    const t = val(`temperature_${l}hPa`);
    if (geo == null || t == null) continue;
    const altM = geo - elev;
    if (altM <= 0) continue; // pressure level is below ground at this station
    const rh = val(`relative_humidity_${l}hPa`);
    levels.push({
      altM,
      tempC: t,
      dewpC: rh != null ? dewPointFromRH(t, rh) : null,
      rhPct: rh,
      windDirDeg: val(`wind_direction_${l}hPa`),
      windKt: val(`wind_speed_${l}hPa`),
      cloudPct: val(`cloud_cover_${l}hPa`),
      source: 'model',
    });
  }

  return levels.sort((a, b) => a.altM - b.altM);
}

export interface OpenMeteoDeps {
  fetchJson?: (url: string) => Promise<unknown>;
  now?: Date;
}

const defaultFetchJson = (url: string): Promise<unknown> => cachedFetchJson(url, OM_TTL_MS);

/** Fetch the vertical profile (raw model levels) for a location. */
export async function getProfile(coord: Coord, deps: OpenMeteoDeps = {}): Promise<ProfileLevel[]> {
  const fj = deps.fetchJson ?? defaultFetchJson;
  const now = deps.now ?? new Date();
  const data = (await fj(buildUrl(coord))) as OpenMeteoResponse | undefined;
  return parseProfile(data, now);
}

export interface SurfaceFallback {
  coord: Coord;
  observedAt: Date;
  tempC: number | null;
  dewpC: number | null;
  rhPct: number | null;
  windDirDeg: number | null;
  windKt: number | null;
}

/** Surface conditions only — used when no METAR station is nearby (clearly "model, no METAR"). */
export async function getSurfaceFallback(
  coord: Coord,
  deps: OpenMeteoDeps = {},
): Promise<SurfaceFallback> {
  const fj = deps.fetchJson ?? defaultFetchJson;
  const now = deps.now ?? new Date();
  const data = (await fj(buildUrl(coord))) as OpenMeteoResponse | undefined;
  const times = timesOf(data);
  if (!times || !data?.hourly) {
    return { coord, observedAt: now, tempC: null, dewpC: null, rhPct: null, windDirDeg: null, windKt: null };
  }
  const i = nearestHourIndex(times, now);
  const val = reader(data.hourly, i);
  const t = val('temperature_2m');
  const rh = val('relative_humidity_2m');
  return {
    coord,
    observedAt: new Date(`${times[i]}Z`),
    tempC: t,
    dewpC: t != null && rh != null ? dewPointFromRH(t, rh) : null,
    rhPct: rh,
    windDirDeg: val('wind_direction_10m'),
    windKt: val('wind_speed_10m'),
  };
}
