// Comfort/wetness at a glance: big temperature, prominent humidity, dew point + spread as
// compact secondary facts. Same nulls-in → dashes-out guards as ThermoCard; no invented metrics.

import { rhFromDewPoint } from '../../domain/humidity';
import { round } from '../../domain/units';
import type { Metar, ModelConditions } from '../../domain/types';
import styles from './OverviewGrid.module.css';

export function ThermoTile({ metar, model }: { metar: Metar; model: ModelConditions | null }) {
  const tempC = metar.tempC ?? model?.tempC2m ?? null;
  const dewpC = metar.dewpC ?? model?.dewp2m ?? null;
  const rh =
    tempC != null && dewpC != null
      ? round(rhFromDewPoint(tempC, dewpC))
      : model?.rh2m != null
        ? round(model.rh2m)
        : null;
  const spread = tempC != null && dewpC != null ? round(tempC - dewpC, 1) : null;

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>Temp &amp; moisture</h3>
      <div className={styles.thermoBody}>
        <div>
          <span className={styles.big}>{tempC != null ? round(tempC, 1) : '—'}</span>
          <span className={styles.bigUnit}>°C</span>
        </div>
        {rh != null && (
          <div className={styles.humidity}>
            {rh}% <span className={styles.humidityLabel}>humidity</span>
          </div>
        )}
        {dewpC != null ? (
          <div className={`${styles.sub} ${styles.thermoRow}`}>
            <span>Dew {round(dewpC, 1)}°C</span>
            {spread != null && <span>Δ {spread}°C</span>}
          </div>
        ) : (
          <div className={styles.sub}>Dew point not reported</div>
        )}
      </div>
    </div>
  );
}
