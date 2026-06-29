// Unit conversions. Canonical internal units: knots (speed), metres (height/altitude),
// degrees Celsius (temperature), hectopascals (pressure). See docs/spec.md §9.

export const KT_TO_MS = 0.514444;
export const KT_TO_KMH = 1.852;
export const FT_TO_M = 0.3048;
const HPA_TO_INHG = 0.029529983071445;

export const ktToMs = (kt: number): number => kt * KT_TO_MS;
export const ktToKmh = (kt: number): number => kt * KT_TO_KMH;
export const msToKt = (ms: number): number => ms / KT_TO_MS;
export const kmhToKt = (kmh: number): number => kmh / KT_TO_KMH;

export const ftToM = (ft: number): number => ft * FT_TO_M;
export const mToFt = (m: number): number => m / FT_TO_M;

export const hpaToInhg = (hpa: number): number => hpa * HPA_TO_INHG;
export const inhgToHpa = (inhg: number): number => inhg / HPA_TO_INHG;

/** Round to a fixed number of decimals (default 0), avoiding -0. */
export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}

/** User-selectable wind display unit. Canonical wind values are always kept in knots. */
export type WindUnit = 'kt' | 'ms' | 'kmh';

/** Format a wind speed (canonical knots) in the chosen display unit, e.g. "7.7 m/s". */
export function fmtWindSpeed(speedKt: number, unit: WindUnit): string {
  if (unit === 'ms') return `${round(ktToMs(speedKt), 1)} m/s`;
  if (unit === 'kmh') return `${round(ktToKmh(speedKt), 1)} km/h`;
  return `${round(speedKt)} kt`;
}
