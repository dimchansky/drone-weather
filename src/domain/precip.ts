// Precipitation-now: a compact, honestly-sourced answer to "is it (going to be) wet right
// now?". This is a DISPLAY helper only — it never joins the risk aggregation, so it cannot
// double-count (moisture/wetness already owns precipitation severity in risk.ts). It reuses the
// same METAR predicates + model thresholds so the pill and the Moisture row always agree, and it
// always names the source so a model probability never reads as observed rain.

import type { Metar, ModelConditions } from './types';
import { round } from './units';
import { hasPrecip, hasThunderstorm, hasFreezingPrecip } from './metar';

export interface PrecipNow {
  raining: boolean; // precipitation falling now (observed, or model amount ≥ threshold)
  text: string;
  source: 'metar' | 'model' | 'none';
}

/** Name the observed precipitation type for a friendlier, still-accurate label. */
function precipLabel(metar: Metar): string {
  const codes = metar.weather.flatMap((w) => w.phenomena);
  if (codes.includes('SN')) return 'snow';
  if (codes.includes('DZ')) return 'drizzle';
  if (codes.includes('GR') || codes.includes('GS')) return 'hail';
  if (codes.includes('RA')) return 'rain';
  return 'precipitation';
}

export function precipNow(metar: Metar, model: ModelConditions | null): PrecipNow {
  // Observed (METAR) wins — it is ground truth for "now".
  if (hasThunderstorm(metar)) return { raining: true, text: 'METAR: thunderstorm', source: 'metar' };
  if (hasFreezingPrecip(metar)) return { raining: true, text: 'METAR: freezing precipitation now', source: 'metar' };
  if (hasPrecip(metar)) return { raining: true, text: `METAR: ${precipLabel(metar)} now`, source: 'metar' };

  // Model fallback — always prefixed "Model:" so it never looks like an observation.
  if (model?.precipMm != null && model.precipMm >= 0.1) {
    return { raining: true, text: `Model: rain likely (~${round(model.precipMm, 1)} mm/h)`, source: 'model' };
  }
  if (model?.precipProb != null && model.precipProb >= 60) {
    return { raining: false, text: `Model: ${round(model.precipProb)}% precip chance`, source: 'model' };
  }

  return { raining: false, text: 'No precipitation reported now', source: 'none' };
}
