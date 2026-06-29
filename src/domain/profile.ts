// Vertical temperature profile. Two sources:
//   - lapse: naive extrapolation of the surface temperature (offline / fallback),
//   - model: forecast pressure-level data (Open-Meteo) interpolated to standard altitudes.
// See docs/spec.md §4.6 and docs/initial-idea.md §7.6–7.7.

import type { ProfileLevel, VerticalProfile } from './types';

/** Altitudes (m AGL) the analyzer focuses on; low band first. */
export const DEFAULT_ALTS_M = [0, 30, 50, 100, 120, 150, 300, 500, 750, 1000];

/** Standard environmental lapse rate: 6.5 °C per 1000 m. */
export const LAPSE_C_PER_M = 0.0065;

const LAPSE_NOTE =
  'Temperature estimated with the standard environmental lapse rate (6.5 °C/km). ' +
  'A model, not a measured sounding. Moisture aloft is not extrapolated.';

const MODEL_NOTE =
  'Vertical profile from a forecast model (Open-Meteo), interpolated to standard altitudes. ' +
  'The 0 m point is the model surface and can differ slightly from the station METAR temperature.';

/** Minimum surface-to-aloft warming (°C) to call it an inversion. */
const INVERSION_MIN_DELTA_C = 0.5;

/**
 * Detect a low-level temperature inversion: a level above the surface that is warmer than the
 * surface by at least `INVERSION_MIN_DELTA_C`. Returns the warmest level's altitude and the
 * warming amount, or null. (Lapse profiles are monotonic, so this only fires for model data.)
 */
export function detectInversion(
  levels: { altM: number; tempC: number }[],
): { topM: number; deltaC: number } | null {
  if (levels.length < 2) return null;
  const surface = levels.reduce((a, b) => (a.altM <= b.altM ? a : b));
  const warmest = levels.reduce((a, b) => (b.tempC > a.tempC ? b : a));
  const deltaC = warmest.tempC - surface.tempC;
  if (warmest.altM > surface.altM && deltaC >= INVERSION_MIN_DELTA_C) {
    return { topM: warmest.altM, deltaC };
  }
  return null;
}

/** Build a lapse-rate profile from the surface temperature. */
export function lapseProfile(
  surfaceTempC: number,
  alts: number[] = DEFAULT_ALTS_M,
): VerticalProfile {
  const levels: ProfileLevel[] = alts.map((altM) => ({
    altM,
    tempC: surfaceTempC - LAPSE_C_PER_M * altM,
    dewpC: null,
    rhPct: null,
    source: 'lapse',
  }));
  return { levels, source: 'lapse', note: LAPSE_NOTE };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-arc interpolation between two compass bearings (degrees). */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180; // (-180, 180]
  return ((a + diff * t) % 360 + 360) % 360;
}

const lerpNullable = (
  a: number | null | undefined,
  b: number | null | undefined,
  t: number,
): number | null =>
  a == null || b == null ? null : lerp(a, b, t);

function interpAt(sorted: ProfileLevel[], altM: number): ProfileLevel {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (altM <= first.altM) return { ...first, altM, source: 'model' };
  if (altM >= last.altM) return { ...last, altM, source: 'model' };

  let lo = first;
  let hi = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].altM <= altM && altM <= sorted[i + 1].altM) {
      lo = sorted[i];
      hi = sorted[i + 1];
      break;
    }
  }
  const t = (altM - lo.altM) / (hi.altM - lo.altM);
  return {
    altM,
    tempC: lerp(lo.tempC, hi.tempC, t),
    dewpC: lerpNullable(lo.dewpC, hi.dewpC, t),
    rhPct: lerpNullable(lo.rhPct, hi.rhPct, t),
    windDirDeg:
      lo.windDirDeg == null || hi.windDirDeg == null
        ? null
        : lerpAngle(lo.windDirDeg, hi.windDirDeg, t),
    windKt: lerpNullable(lo.windKt, hi.windKt, t),
    cloudPct: lerpNullable(lo.cloudPct, hi.cloudPct, t),
    source: 'model',
  };
}

/**
 * Interpolate raw model levels (at arbitrary altitudes) onto the standard altitude grid.
 * `modelLevels` must contain at least one level; values outside its range are clamped.
 */
export function mergeModelProfile(
  modelLevels: ProfileLevel[],
  alts: number[] = DEFAULT_ALTS_M,
): VerticalProfile {
  const sorted = [...modelLevels].sort((a, b) => a.altM - b.altM);
  const levels = alts.map((altM) => interpAt(sorted, altM));
  return { levels, source: 'model', note: MODEL_NOTE };
}
