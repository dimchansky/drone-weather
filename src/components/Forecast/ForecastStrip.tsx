import type { ForecastSummary } from '../../domain/forecast';
import type { WindUnit } from '../../domain/units';
import { InfoStrip } from '../common/InfoStrip';
import { forecastStripText } from './forecastText';

/**
 * Layer 2 — the short-term (1–3 h) model forecast: wind/gust trend + rain onset, so a pilot knows
 * whether conditions hold while they get ready and travel. Colored by the forecast advisory
 * (CAUTION when rain/rising wind is expected). Model forecast — labelled as such, not observed.
 */
export function ForecastStrip({ forecast, windUnit }: { forecast: ForecastSummary; windUnit: WindUnit }) {
  if (!forecast.available) return null;
  return (
    <InfoStrip severity={forecast.severity} title="Short-term forecast (Open-Meteo model)">
      {forecastStripText(forecast, windUnit)}
    </InfoStrip>
  );
}
