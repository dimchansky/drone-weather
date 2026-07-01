// Short-term (1–3 h) forecast summary — pure. Turns the Open-Meteo hourly look-ahead window into
// a structured trend (wind/gust direction of travel + rain onset) with a CAUTION/GOOD advisory.
// This is MODEL forecast data (always labelled as such in the UI); the observed METAR still drives
// the actual verdict. Values stay canonical (knots); the UI formats them in the user's unit.

import type { ForecastHour, Severity } from './types';
import { ktToMs } from './units';

export type WindTrend = 'steady' | 'rising' | 'easing';

export interface ForecastSummary {
  available: boolean; // false when the window has no usable data
  horizonH: number; // hours the window covers (from now)
  windTrend: WindTrend;
  windNowKt: number | null;
  windPeakKt: number | null;
  windLowKt: number | null;
  gustPeakKt: number | null;
  gustRising: boolean; // gust peak notably above the current wind
  rainOnsetMin: number | null; // minutes from now to the first likely-precip hour; null if none in window
  rainProbPeak: number | null;
  rainAmountPeak: number | null;
  severity: Severity; // GOOD (benign) or CAUTION (rain/rising wind ahead) — advisory, capped at CAUTION
}

// Thresholds (conservative, model-oriented).
const WIND_CHANGE_KT = 4; // ~2 m/s change over the window counts as a real trend
const GUST_SPREAD_KT = 8; // gust peak this far above the current wind = "gusty ahead"
const RAIN_PROB_PCT = 50;
const RAIN_MM = 0.1;
const WIND_CAUTION_MS = 8; // forecast wind reaching the HIGH band raises the advisory

const EMPTY: ForecastSummary = {
  available: false,
  horizonH: 0,
  windTrend: 'steady',
  windNowKt: null,
  windPeakKt: null,
  windLowKt: null,
  gustPeakKt: null,
  gustRising: false,
  rainOnsetMin: null,
  rainProbPeak: null,
  rainAmountPeak: null,
  severity: 'GOOD',
};

export function summarizeForecast(now: Date, hours: ForecastHour[]): ForecastSummary {
  if (hours.length === 0) return EMPTY;

  const last = hours[hours.length - 1];
  const horizonH = Math.max(0, Math.round((last.time.getTime() - now.getTime()) / 3600000));

  const winds = hours.map((h) => h.windKt).filter((w): w is number => w != null);
  const windNowKt = winds.length ? winds[0] : null;
  const windPeakKt = winds.length ? Math.max(...winds) : null;
  const windLowKt = winds.length ? Math.min(...winds) : null;

  let windTrend: WindTrend = 'steady';
  if (windNowKt != null && windPeakKt != null && windLowKt != null) {
    if (windPeakKt - windNowKt >= WIND_CHANGE_KT) windTrend = 'rising';
    else if (windNowKt - windLowKt >= WIND_CHANGE_KT) windTrend = 'easing';
  }

  const gusts = hours.map((h) => h.gustKt).filter((g): g is number => g != null);
  const gustPeakKt = gusts.length ? Math.max(...gusts) : null;
  const gustRising = gustPeakKt != null && windNowKt != null && gustPeakKt - windNowKt >= GUST_SPREAD_KT;

  let rainOnsetMin: number | null = null;
  let rainProbPeak: number | null = null;
  let rainAmountPeak: number | null = null;
  for (const h of hours) {
    if (h.precipProb != null) rainProbPeak = Math.max(rainProbPeak ?? 0, h.precipProb);
    if (h.precipMm != null) rainAmountPeak = Math.max(rainAmountPeak ?? 0, h.precipMm);
    const likely =
      (h.precipMm != null && h.precipMm >= RAIN_MM) || (h.precipProb != null && h.precipProb >= RAIN_PROB_PCT);
    if (likely && rainOnsetMin == null) {
      rainOnsetMin = Math.max(0, Math.round((h.time.getTime() - now.getTime()) / 60000));
    }
  }

  const windCautions = windPeakKt != null && ktToMs(windPeakKt) >= WIND_CAUTION_MS;
  const severity: Severity = rainOnsetMin != null || windCautions || gustRising ? 'CAUTION' : 'GOOD';

  return {
    available: winds.length > 0 || gusts.length > 0,
    horizonH,
    windTrend,
    windNowKt,
    windPeakKt,
    windLowKt,
    gustPeakKt,
    gustRising,
    rainOnsetMin,
    rainProbPeak,
    rainAmountPeak,
    severity,
  };
}
