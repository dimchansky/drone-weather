// Wind route advice — the outbound/return tip, shared by the WindCompass card and the
// decision banner so there is one source of truth. Pure and testable.

import type { Wind } from './types';
import { compassPoint } from './geo';

/**
 * Tactical route advice for the current wind: fly the harder (into-wind) leg first, on a
 * fresher battery, and return with the wind. Calm / variable winds get their own note.
 */
export function routeAdvice(wind: Wind): string {
  if (wind.calm) {
    return 'Winds are calm — direction is not a concern for your route.';
  }
  if (wind.dirDeg == null) {
    return 'Wind direction is variable — plan for shifting drift in all directions.';
  }
  const drift = (wind.dirDeg + 180) % 360;
  return `Fly outbound toward ${wind.dirDeg}° (${compassPoint(wind.dirDeg)}) — into the wind — and return with the wind toward ${drift}° (${compassPoint(drift)}). The harder leg is then flown on a fresher battery.`;
}
