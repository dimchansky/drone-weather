// Compact square wind tile — the shared compass (unchanged clarity) plus speed in the selected
// unit, FROM direction with drift, and compact gust / variable-sector lines. Nothing verdict-like:
// wind severity lives in the risk engine.

import { compassPoint } from '../../domain/geo';
import { ktToMs, ktToKmh, round, fmtWindSpeed } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
import type { Wind } from '../../domain/types';
import { CompassSvg } from '../Wind/CompassSvg';
import styles from './OverviewGrid.module.css';

export function WindTile({ wind }: { wind: Wind }) {
  const windUnit = useSettingsStore((s) => s.windUnit);
  const primaryNum =
    windUnit === 'ms'
      ? round(ktToMs(wind.speedKt), 1)
      : windUnit === 'kmh'
        ? round(ktToKmh(wind.speedKt), 1)
        : round(wind.speedKt);
  const primaryUnit = windUnit === 'ms' ? 'm/s' : windUnit === 'kmh' ? 'km/h' : 'kt';

  const driftDeg = wind.dirDeg != null ? (wind.dirDeg + 180) % 360 : null;
  const from = wind.calm
    ? 'Calm'
    : wind.dirDeg != null
      ? `from ${wind.dirDeg}° ${compassPoint(wind.dirDeg)}${driftDeg != null ? ` → ${compassPoint(driftDeg)}` : ''}`
      : 'Variable direction';

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>Wind</h3>
      <div className={styles.windBody}>
        <CompassSvg wind={wind} className={styles.compass} />
        <div className={styles.speedRow}>
          <span className={styles.big}>{primaryNum}</span>
          <span className={styles.bigUnit}>{primaryUnit}</span>
        </div>
        <div className={styles.windFrom}>{from}</div>
        {wind.gustKt != null && (
          <div className={styles.gust}>Gusts {fmtWindSpeed(wind.gustKt, windUnit)}</div>
        )}
        {wind.varFromDeg != null && wind.varToDeg != null && (
          <div className={styles.varNote}>
            var {wind.varFromDeg}°–{wind.varToDeg}°
          </div>
        )}
      </div>
    </div>
  );
}
