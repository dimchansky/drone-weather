// Display formatting helpers (presentation only).
import { ktToMs, ktToKmh, mToFt, round } from '../domain/units';
import { compassPoint } from '../domain/geo';
import type { AltUnit, WindUnit } from '../store/settingsStore';

export function fmtWind(speedKt: number, unit: WindUnit): string {
  if (unit === 'ms') return `${round(ktToMs(speedKt), 1)} m/s`;
  if (unit === 'kmh') return `${round(ktToKmh(speedKt), 1)} km/h`;
  return `${round(speedKt)} kt`;
}

export const fmtWindAll = (speedKt: number): string =>
  `${round(speedKt)} kt · ${round(ktToMs(speedKt), 1)} m/s · ${round(ktToKmh(speedKt), 1)} km/h`;

export const fmtAlt = (m: number, unit: AltUnit): string =>
  unit === 'ft' ? `${round(mToFt(m))} ft` : `${round(m)} m`;

export const fmtAltBoth = (m: number): string => `${round(m)} m / ${round(mToFt(m))} ft`;

export const fmtDistance = (km: number): string =>
  km < 1 ? `${round(km * 1000)} m` : `${round(km, 1)} km`;

export const fmtBearing = (deg: number): string => `${round(deg)}° ${compassPoint(deg)}`;

export const fmtAge = (min: number): string =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;

export const fmtCoord = (lat: number, lon: number): string =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
