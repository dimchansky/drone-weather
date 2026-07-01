// "What is happening outside right now?" at a glance: big icon, temperature, short condition
// label. Sourcing is conservative (see domain/currentConditions.ts); a small "model" badge marks
// model-derived conditions so they never read as observations.

import { currentConditions } from '../../domain/currentConditions';
import type { DaylightPhase } from '../../domain/sun';
import type { Brief } from '../../domain/brief';
import { round } from '../../domain/units';
import { WeatherIcon } from './WeatherIcon';
import styles from './OverviewGrid.module.css';

export function CurrentWeatherTile({ brief, phase }: { brief: Brief; phase: DaylightPhase }) {
  const cond = currentConditions(brief.metar, brief.model, phase, brief.source);
  const tempC = brief.metar.tempC ?? brief.model?.tempC2m ?? null;

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>
        Now
        {cond.source === 'model' && <span className={styles.badge}>model</span>}
      </h3>
      <div className={styles.cwBody}>
        <WeatherIcon icon={cond.icon} label={cond.label} size={48} />
        <div>
          <span className={styles.big}>{tempC != null ? round(tempC) : '—'}</span>
          <span className={styles.bigUnit}>°C</span>
        </div>
        <div className={styles.cwCondition}>{cond.label}</div>
      </div>
    </div>
  );
}
