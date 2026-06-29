// Display formatting helpers (presentation only).
import { ktToMs, ktToKmh, round, fmtWindSpeed, type WindUnit } from '../domain/units';
import { compassPoint } from '../domain/geo';

// Canonical altitude formatters live in the domain (units.ts) so domain reason strings and the
// UI render altitudes identically. Re-exported here for the components that already import them.
export { fmtAlt, fmtAltFt, fmtAltBoth, fmtAltBothFt } from '../domain/units';

/** Wind speed in the chosen unit (delegates to the canonical formatter). */
export const fmtWind = (speedKt: number, unit: WindUnit): string => fmtWindSpeed(speedKt, unit);

export const fmtWindAll = (speedKt: number): string =>
  `${round(speedKt)} kt · ${round(ktToMs(speedKt), 1)} m/s · ${round(ktToKmh(speedKt), 1)} km/h`;

export const fmtDistance = (km: number): string =>
  km < 1 ? `${round(km * 1000)} m` : `${round(km, 1)} km`;

export const fmtBearing = (deg: number): string => `${round(deg)}° ${compassPoint(deg)}`;

export const fmtAge = (min: number): string =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;

export const fmtCoord = (lat: number, lon: number): string =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
