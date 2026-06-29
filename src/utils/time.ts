// Time / age helpers. Pure and deterministic (callers pass `now`).

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
