// Comfort/wetness at a glance: thermometer + big temperature, droplet + big humidity, dew point
// and spread as one compact line, and a short moisture status. Status thresholds match
// ThermoCard's interpretation (spread >5 dry, ≥2 moderate, else near saturation); no invented
// metrics. Nulls in → dashes/hidden rows out.

import { rhFromDewPoint } from '../../domain/humidity';
import { round } from '../../domain/units';
import type { Metar, ModelConditions } from '../../domain/types';
import { Glyph } from './Glyphs';
import styles from './OverviewGrid.module.css';

/** Short moisture status from the dew-point spread (same bands as ThermoCard's interpretation). */
export function moistureStatus(spread: number): { text: string; risky: boolean } {
  if (spread > 5) return { text: 'Dry air', risky: false };
  if (spread >= 2) return { text: 'Some moisture', risky: false };
  return { text: 'Dew risk', risky: true };
}

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
  const status = spread != null ? moistureStatus(spread) : null;

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>Temp &amp; moisture</h3>
      <div className={styles.thermoBody}>
        <div className={styles.glyphRow}>
          <Glyph kind="thermometer" className={styles.glyphTemp} />
          <span>
            <span className={styles.big}>{tempC != null ? round(tempC, 1) : '—'}</span>
            <span className={styles.bigUnit}>°C</span>
          </span>
        </div>
        {rh != null && (
          <div className={styles.glyphRow}>
            <Glyph kind="droplet" className={styles.glyphDrop} />
            <span>
              <span className={styles.humidity}>{rh}%</span>
              <span className={styles.humidityLabel}> humidity</span>
            </span>
          </div>
        )}
        {dewpC != null ? (
          <div className={styles.sub}>
            Dew {round(dewpC, 1)}°C · Δ {spread}°C
          </div>
        ) : (
          <div className={styles.sub}>Dew point not reported</div>
        )}
        {status && (
          <div className={status.risky ? styles.statusWarn : styles.status}>{status.text}</div>
        )}
      </div>
    </div>
  );
}
