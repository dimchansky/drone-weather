// "What is happening outside right now?" at a glance: a glowing condition icon, big temperature,
// short label, and — when the model sees precipitation coming — a small future-tense chip that
// can't be confused with the current condition. Sourcing is conservative (see
// domain/currentConditions.ts); a "model" badge marks model-derived conditions.

import { currentConditions, type ConditionIcon } from '../../domain/currentConditions';
import type { DaylightPhase } from '../../domain/sun';
import type { Brief } from '../../domain/brief';
import type { ForecastSummary } from '../../domain/forecast';
import { round } from '../../domain/units';
import { fmtDuration } from '../../utils/time';
import { WeatherIcon } from './WeatherIcon';
import { Glyph } from './Glyphs';
import styles from './OverviewGrid.module.css';

const PRECIP_ICONS: ConditionIcon[] = ['rain', 'snow', 'thunder'];

/** Tile wash + icon halo per condition — the tile takes the weather's mood. */
const TONE: Record<ConditionIcon, { tile: string; glow: string }> = {
  sun: { tile: styles.tileSun, glow: styles.glowSun },
  'cloud-sun': { tile: styles.tileSun, glow: styles.glowSun },
  moon: { tile: styles.tileMoon, glow: styles.glowMoon },
  'cloud-moon': { tile: styles.tileMoon, glow: styles.glowMoon },
  cloud: { tile: styles.tileDim, glow: styles.glowDim },
  fog: { tile: styles.tileDim, glow: styles.glowDim },
  rain: { tile: styles.tileSky, glow: styles.glowSky },
  snow: { tile: styles.tileSky, glow: styles.glowSky },
  thunder: { tile: styles.tileStorm, glow: styles.glowStorm },
};

/**
 * Rain-ahead chip text (future tense, from the model forecast window) — null when it's already
 * precipitating (the condition label owns that story) or nothing is coming. Onsets inside the
 * next few minutes read "Rain any moment" — "Rain in ~0m" is technically true but silly.
 */
export function rainSoonChip(icon: ConditionIcon, forecast: ForecastSummary | null): string | null {
  if (PRECIP_ICONS.includes(icon)) return null;
  if (forecast?.available && forecast.rainOnsetMin != null) {
    if (forecast.rainOnsetMin < 5) return 'Rain any moment';
    return `Rain in ~${fmtDuration(forecast.rainOnsetMin)}`;
  }
  return null;
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
  const tone = TONE[cond.icon];
  const chip = rainSoonChip(cond.icon, forecast);
  const isPrecip = PRECIP_ICONS.includes(cond.icon);

  return (
    <div className={`${styles.tile} ${tone.tile}`}>
      <h3 className={styles.tileTitle}>
        Now
        {cond.source === 'model' && <span className={styles.badge}>model</span>}
      </h3>
      <div className={styles.cwBody}>
        <div className={`${styles.iconWrap} ${tone.glow}`}>
          <WeatherIcon icon={cond.icon} label={cond.label} size={56} />
        </div>
        <div>
          <span className={styles.big}>{tempC != null ? round(tempC) : '—'}</span>
          <span className={styles.bigUnit}>°C</span>
        </div>
        <div className={styles.cwCondition}>{cond.label}</div>
        {chip ? (
          <div className={styles.chips}>
            {/* Dashed pill + tiny rain glyph: reads as a future alert, not observed rain. */}
            <span className={`${styles.chip} ${styles.chipCaution} ${styles.chipFuture}`}>
              <Glyph kind="rain" size={13} className={styles.chipGlyph} />
              {chip}
            </span>
          </div>
        ) : (
          // "expected" only when a forecast window actually backs the claim.
          !isPrecip && (
            <div className={styles.status}>
              {forecast?.available ? 'No rain expected' : 'No rain now'}
            </div>
          )
        )}
      </div>
    </div>
  );
}
