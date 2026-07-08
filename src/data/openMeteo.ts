// Open-Meteo adapter (browser-direct: CORS-enabled, keyless). Supplies the vertical
// profile from pressure-level data, plus a surface fallback when no METAR is nearby.
// See docs/spec.md §6.3.

import type { Coord, ForecastHour, LocationTime, ModelConditions, ProfileLevel, TimelineHour } from '../domain/types';
import { dewPointFromRH } from '../domain/humidity';
import { cachedFetchJson } from './cache';

const OM_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_TTL_MS = 30 * 60 * 1000;
// Pressure levels covering roughly the low-altitude drone envelope (surface–~1.5 km). 975 hPa
// (~300 m AGL near sea level) sharpens the 100–500 m gap for the analyzer + model cloud tier —
// a resolution improvement, not a cloud-base accuracy fix (see docs/cloud-base-research.md §3.1).
const LEVELS = [1000, 975, 950, 925, 900, 850] as const;

const SURFACE_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'precipitation',
  'precipitation_probability',
  'cloud_cover',
  'cloud_cover_low',
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
  // forecast_days=2 so the 1–3 h look-ahead window is always available, even late in the day.
  return (
    `${OM_BASE}?latitude=${at.lat}&longitude=${at.lon}` +
    `&hourly=${hourlyVars()}&wind_speed_unit=kn&forecast_days=2&timezone=GMT`
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
  /** Bypass the cache TTL and revalidate (Refresh). */
  force?: boolean;
}

const fetcher = (deps: OpenMeteoDeps) =>
  deps.fetchJson ?? ((url: string) => cachedFetchJson(url, OM_TTL_MS, { force: deps.force }));

/** Fetch the vertical profile (raw model levels) for a location. */
export async function getProfile(coord: Coord, deps: OpenMeteoDeps = {}): Promise<ProfileLevel[]> {
  const fj = fetcher(deps);
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
  const fj = fetcher(deps);
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

const EMPTY_CONDITIONS: ModelConditions = {
  tempC2m: null,
  dewp2m: null,
  rh2m: null,
  windKt: null,
  precipMm: null,
  precipProb: null,
  cloudCoverPct: null,
  cloudCoverLowPct: null,
};

/** Parse surface model conditions (precip, cloud, dew) for the moisture/wetness risk. */
export function parseModelConditions(data: OpenMeteoResponse | undefined, now: Date): ModelConditions {
  const times = timesOf(data);
  if (!times || !data?.hourly) return EMPTY_CONDITIONS;
  const val = reader(data.hourly, nearestHourIndex(times, now));
  return {
    tempC2m: val('temperature_2m'),
    dewp2m: val('dew_point_2m'),
    rh2m: val('relative_humidity_2m'),
    windKt: val('wind_speed_10m'),
    precipMm: val('precipitation'),
    precipProb: val('precipitation_probability'),
    cloudCoverPct: val('cloud_cover'),
    cloudCoverLowPct: val('cloud_cover_low'),
  };
}

/** Fetch surface model conditions (reuses the same cached request as getProfile). */
export async function getModelConditions(
  coord: Coord,
  deps: OpenMeteoDeps = {},
): Promise<ModelConditions> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  const data = (await fj(buildUrl(coord))) as OpenMeteoResponse | undefined;
  return parseModelConditions(data, now);
}

/**
 * Short-term hourly look-ahead window: the nearest hour to `now` (inclusive) through `hours`
 * ahead. Reuses the same cached request as the profile/conditions, so no extra network call.
 */
export function parseForecastWindow(
  data: OpenMeteoResponse | undefined,
  now: Date,
  hours = 3,
): ForecastHour[] {
  const times = timesOf(data);
  if (!times || !data?.hourly) return [];
  const i0 = nearestHourIndex(times, now);
  const out: ForecastHour[] = [];
  for (let i = i0; i < times.length && i <= i0 + hours; i++) {
    const val = reader(data.hourly, i);
    out.push({
      time: new Date(`${times[i]}Z`),
      windKt: val('wind_speed_10m'),
      gustKt: val('wind_gusts_10m'),
      precipMm: val('precipitation'),
      precipProb: val('precipitation_probability'),
    });
  }
  return out;
}

/** Fetch the short-term forecast window (reuses the same cached request as getProfile). */
export async function getForecastWindow(
  coord: Coord,
  deps: OpenMeteoDeps = {},
): Promise<ForecastHour[]> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  const data = (await fj(buildUrl(coord))) as OpenMeteoResponse | undefined;
  return parseForecastWindow(data, now);
}

/**
 * Visual-timeline hours: the nearest hour to `now` (inclusive) through `hours - 1` ahead, with
 * the full per-hour surface fields the request already carries (temp/dew/RH, wind dir/speed/gust,
 * precip amount/probability, cloud cover). Same cached payload — no extra network call.
 */
export function parseTimelineHours(
  data: OpenMeteoResponse | undefined,
  now: Date,
  hours = 12,
): TimelineHour[] {
  const times = timesOf(data);
  if (!times || !data?.hourly) return [];
  const i0 = nearestHourIndex(times, now);
  const out: TimelineHour[] = [];
  for (let i = i0; i < times.length && i < i0 + hours; i++) {
    const val = reader(data.hourly, i);
    out.push({
      time: new Date(`${times[i]}Z`),
      tempC: val('temperature_2m'),
      dewpC: val('dew_point_2m'),
      rhPct: val('relative_humidity_2m'),
      windDirDeg: val('wind_direction_10m'),
      windKt: val('wind_speed_10m'),
      gustKt: val('wind_gusts_10m'),
      precipMm: val('precipitation'),
      precipProb: val('precipitation_probability'),
      cloudCoverPct: val('cloud_cover'),
      cloudCoverLowPct: val('cloud_cover_low'),
    });
  }
  return out;
}

/** Fetch the visual-timeline hours (reuses the same cached request as getProfile). */
export async function getTimelineHours(
  coord: Coord,
  deps: OpenMeteoDeps = {},
): Promise<TimelineHour[]> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  const data = (await fj(buildUrl(coord))) as OpenMeteoResponse | undefined;
  return parseTimelineHours(data, now);
}

/** Device-local offset as a LocationTime fallback (used when the model timezone is unavailable). */
function deviceLocationTime(now?: Date): LocationTime {
  const d = now ?? new Date();
  return { utcOffsetSeconds: -d.getTimezoneOffset() * 60, timezone: null, source: 'device-fallback' };
}

/**
 * Resolve the flight-site timezone via Open-Meteo `timezone=auto` (returns utc_offset_seconds + the
 * IANA name). A small, separately-cached request — keeps the main data fetch in UTC (unchanged).
 * Falls back to the device's local offset if the model timezone is unavailable.
 */
export async function getLocationTime(coord: Coord, deps: OpenMeteoDeps = {}): Promise<LocationTime> {
  const fj = fetcher(deps);
  const now = deps.now ?? new Date();
  try {
    const url =
      `${OM_BASE}?latitude=${coord.lat}&longitude=${coord.lon}` +
      `&current=temperature_2m&timezone=auto&forecast_days=1`;
    const data = (await fj(url)) as { utc_offset_seconds?: number; timezone?: string } | undefined;
    if (data && typeof data.utc_offset_seconds === 'number') {
      return { utcOffsetSeconds: data.utc_offset_seconds, timezone: data.timezone ?? null, source: 'open-meteo' };
    }
  } catch {
    // network/parse failure → device fallback below
  }
  return deviceLocationTime(now);
}
