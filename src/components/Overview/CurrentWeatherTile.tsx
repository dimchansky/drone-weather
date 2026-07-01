// "What is happening outside right now?" at a glance: big icon, temperature, short condition
// label, and one small insight line (rain onset from the model forecast, or "No rain now").
// Sourcing is conservative (see domain/currentConditions.ts); a small "model" badge marks
// model-derived conditions so they never read as observations.

import { currentConditions, type ConditionIcon } from '../../domain/currentConditions';
import type { DaylightPhase } from '../../domain/sun';
import type { Brief } from '../../domain/brief';
import type { ForecastSummary } from '../../domain/forecast';
import { round } from '../../domain/units';
import { fmtDuration } from '../../utils/time';
import { WeatherIcon } from './WeatherIcon';
import styles from './OverviewGrid.module.css';

const PRECIP_ICONS: ConditionIcon[] = ['rain', 'snow', 'thunder'];

/** One short secondary insight; null when the condition label already tells the precip story. */
export function precipInsight(icon: ConditionIcon, forecast: ForecastSummary | null): string | null {
  if (PRECIP_ICONS.includes(icon)) return null;
  if (forecast?.available && forecast.rainOnsetMin != null) {
    return `Rain in ~${fmtDuration(forecast.rainOnsetMin)}`;
  }
  return 'No rain now';
}

export function CurrentWeatherTile({
  brief,
  phase,
  forecast,
}: {
  brief: Brief;
  phase: DaylightPhase;
  forecast: ForecastSummary | null;
}) {
  const cond = currentConditions(brief.metar, brief.model, phase, brief.source);
  const tempC = brief.metar.tempC ?? brief.model?.tempC2m ?? null;
  const insight = precipInsight(cond.icon, forecast);

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>
        Now
        {cond.source === 'model' && <span className={styles.badge}>model</span>}
      </h3>
      <div className={styles.cwBody}>
        <WeatherIcon icon={cond.icon} label={cond.label} size={52} />
        <div>
          <span className={styles.big}>{tempC != null ? round(tempC) : '—'}</span>
          <span className={styles.bigUnit}>°C</span>
        </div>
        <div className={styles.cwCondition}>{cond.label}</div>
        {insight && <div className={styles.status}>{insight}</div>}
      </div>
    </div>
  );
}
