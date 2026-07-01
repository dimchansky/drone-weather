// Presentation helpers for the short-term forecast — format the structured ForecastSummary into
// the Layer-2 strip line and an optional banner note. Wind values render in the user's unit; the
// text always says "model" so a model forecast never reads as an observation.

import type { ForecastSummary } from '../../domain/forecast';
import type { WindUnit } from '../../domain/units';
import { fmtWindSpeed } from '../../domain/units';
import { fmtDuration } from '../../utils/time';

const rainPart = (f: ForecastSummary): string =>
  f.rainOnsetMin == null
    ? 'no rain expected'
    : f.rainOnsetMin <= 5
      ? 'rain likely now'
      : `rain likely in ~${fmtDuration(f.rainOnsetMin)}`;

/** Full one-line strip: "Next 3h (model): wind steady · no rain expected". */
export function forecastStripText(f: ForecastSummary, unit: WindUnit): string {
  const h = f.horizonH > 0 ? f.horizonH : 1;
  const windPart =
    f.windTrend === 'rising' && f.windPeakKt != null
      ? `wind rising to ${fmtWindSpeed(f.windPeakKt, unit)}`
      : f.windTrend === 'easing' && f.windLowKt != null
        ? `wind easing to ${fmtWindSpeed(f.windLowKt, unit)}`
        : 'wind steady';
  const gustPart = f.gustRising && f.gustPeakKt != null ? ` · gusts to ${fmtWindSpeed(f.gustPeakKt, unit)}` : '';
  return `Next ${h}h (model): ${windPart}${gustPart} · ${rainPart(f)}`;
}

/** Short banner note — only when the forecast is notable (severity > GOOD); null otherwise. */
export function forecastBannerNote(f: ForecastSummary, unit: WindUnit): string | null {
  if (!f.available || f.severity === 'GOOD') return null;
  if (f.rainOnsetMin != null) {
    return f.rainOnsetMin <= 5 ? 'Model: rain likely now' : `Model: rain likely in ~${fmtDuration(f.rainOnsetMin)}`;
  }
  if (f.windTrend === 'rising' && f.windPeakKt != null) {
    return `Model: wind rising to ${fmtWindSpeed(f.windPeakKt, unit)} soon`;
  }
  if (f.gustRising && f.gustPeakKt != null) {
    return `Model: gusts building to ${fmtWindSpeed(f.gustPeakKt, unit)} soon`;
  }
  return null;
}
