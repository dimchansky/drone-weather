// Compact square wind tile — the shared compass front and center, speed large in the selected
// unit, explicit From/Drifts bearings, and gusts / variable sector as compact chips. Nothing
// verdict-like: wind severity lives in the risk engine.

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

  return (
    <div className={`${styles.tile} ${styles.tileSky}`}>
      <h3 className={styles.tileTitle}>Wind</h3>
      <div className={styles.windBody}>
        <CompassSvg wind={wind} className={styles.compass} />
        <div className={styles.speedRow}>
          <span className={styles.big}>{primaryNum}</span>
          <span className={styles.bigUnit}>{primaryUnit}</span>
        </div>
        {wind.calm ? (
          <div className={styles.windFrom}>Calm</div>
        ) : wind.dirDeg != null ? (
          <>
            <div className={styles.windFrom}>
              From {wind.dirDeg}° {compassPoint(wind.dirDeg)}
            </div>
            {driftDeg != null && (
              <div className={styles.windDrift}>
                Drifts {driftDeg}° {compassPoint(driftDeg)}
              </div>
            )}
          </>
        ) : (
          <div className={styles.windFrom}>Variable direction</div>
        )}
        {(wind.gustKt != null || (wind.varFromDeg != null && wind.varToDeg != null)) && (
          <div className={styles.chips}>
            {wind.gustKt != null && (
              <span className={`${styles.chip} ${styles.chipHigh}`}>
                G {fmtWindSpeed(wind.gustKt, windUnit)}
              </span>
            )}
            {wind.varFromDeg != null && wind.varToDeg != null && (
              <span className={`${styles.chip} ${styles.chipCaution}`}>
                Var {wind.varFromDeg}–{wind.varToDeg}°
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
