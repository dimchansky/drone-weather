// Time / age helpers. Pure and deterministic (callers pass `now`).

import type { LocationTime } from '../domain/types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Whole minutes between an observation and `now`, clamped at 0. */
export function ageMinutes(observedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - observedAt.getTime()) / 60000));
}

/** Local wall-clock time as HH:MM (24h), in the runtime's time zone. */
export function fmtLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** UTC time as HH:MMZ (deterministic, zone-independent). */
export function fmtUtcTime(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

/** A duration in whole minutes as "6h 20m" / "45m" (clamped at 0). */
export function fmtDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Format an absolute instant as HH:MM in the flight-site's local time (via its UTC offset). */
export function fmtTimeInZone(d: Date, lt: LocationTime): string {
  const shifted = new Date(d.getTime() + lt.utcOffsetSeconds * 1000);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Human label for the time source: the IANA zone name, "location time", or "device local time". */
export function timeSourceLabel(lt: LocationTime): string {
  if (lt.source === 'device-fallback') return 'device local time';
  return lt.timezone ?? 'location time';
}
