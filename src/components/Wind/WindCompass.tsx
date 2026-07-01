import { Card } from '../common/Card';
import { compassPoint } from '../../domain/geo';
import { routeAdvice } from '../../domain/windAdvice';
import { ktToMs, ktToKmh, round, fmtWindSpeed } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
import type { Wind } from '../../domain/types';
import { CompassSvg } from './CompassSvg';
import styles from './WindCompass.module.css';

export function WindCompass({ wind }: { wind: Wind }) {
  const driftDeg = wind.dirDeg != null ? (wind.dirDeg + 180) % 360 : null;

  // Primary wind unit follows the user's setting; the other two are shown as secondary.
  const windUnit = useSettingsStore((s) => s.windUnit);
  const parts: Record<'kt' | 'ms' | 'kmh', string> = {
    kt: `${round(wind.speedKt)} kt`,
    ms: `${round(ktToMs(wind.speedKt), 1)} m/s`,
    kmh: `${round(ktToKmh(wind.speedKt), 1)} km/h`,
  };
  const order: ('kt' | 'ms' | 'kmh')[] =
    windUnit === 'ms' ? ['ms', 'kt', 'kmh'] : windUnit === 'kmh' ? ['kmh', 'kt', 'ms'] : ['kt', 'ms', 'kmh'];
  const primaryNum =
    windUnit === 'ms'
      ? round(ktToMs(wind.speedKt), 1)
      : windUnit === 'kmh'
        ? round(ktToKmh(wind.speedKt), 1)
        : round(wind.speedKt);
  const primaryUnit = windUnit === 'ms' ? 'm/s' : windUnit === 'kmh' ? 'km/h' : 'kt';
  const secondary = order.slice(1).map((u) => parts[u]).join(' · ');

  return (
    <Card title="Wind">
      <div className={styles.layout}>
        <CompassSvg wind={wind} className={styles.svg} />

        <div className={styles.facts}>
          <div className={styles.speedRow}>
            <span className={styles.speed}>{primaryNum}</span>
            <span className={styles.speedUnit}>{primaryUnit}</span>
            <span className={styles.speedAlt}>{secondary}</span>
          </div>
          {wind.gustKt != null && (
            <p className={styles.gust}>Gusts to {fmtWindSpeed(wind.gustKt, windUnit)}</p>
          )}
          <dl className={styles.dirs}>
            <div>
              <dt>From</dt>
              <dd>{wind.dirDeg != null ? `${wind.dirDeg}° ${compassPoint(wind.dirDeg)}` : 'Variable'}</dd>
            </div>
            <div>
              <dt>Drifts toward</dt>
              <dd>{driftDeg != null ? `${driftDeg}° ${compassPoint(driftDeg)}` : '—'}</dd>
            </div>
          </dl>
          {wind.varFromDeg != null && wind.varToDeg != null && (
            <p className={styles.varNote}>
              Direction varying {wind.varFromDeg}°–{wind.varToDeg}°.
            </p>
          )}
        </div>
      </div>

      <p className={styles.advice}>{routeAdvice(wind)}</p>
    </Card>
  );
}
