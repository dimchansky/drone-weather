// Comfort/wetness as an instrument: thermometer + big temperature, droplet + big humidity with a
// small moisture scale, one compact dew/spread caption, and a human status chip. Status derives
// only from the existing spread bands (ThermoCard's interpretation) and the computed RH — no
// invented metrics. Nulls in → dashes/hidden rows out.

import { rhFromDewPoint } from '../../domain/humidity';
import { round } from '../../domain/units';
import type { Metar, ModelConditions } from '../../domain/types';
import { Glyph } from './Glyphs';
import styles from './OverviewGrid.module.css';

export type MoistureTone = 'warn' | 'info' | 'ok';

/**
 * Short human moisture status. The near-saturation band keeps ThermoCard's threshold
 * (spread < 2) but explains itself — temp is close to the dew point; otherwise very high RH
 * reads "Very humid", a wide spread "Dry air".
 */
export function moistureStatus(spread: number, rh: number): { text: string; tone: MoistureTone } {
  if (spread < 2) return { text: 'Near saturation', tone: 'warn' };
  if (rh >= 85) return { text: 'Very humid', tone: 'info' };
  if (spread > 5) return { text: 'Dry air', tone: 'ok' };
  return { text: 'Moderate humidity', tone: 'ok' };
}

const TONE_CLASS: Record<MoistureTone, string> = {
  warn: styles.chipCaution,
  info: styles.chipInfo,
  ok: '',
};

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
  const status = spread != null && rh != null ? moistureStatus(spread, rh) : null;

  return (
    <div className={`${styles.tile} ${styles.tileSky}`}>
      <h3 className={styles.tileTitle}>Temp &amp; moisture</h3>
      <div className={styles.thermoBody}>
        {/* One glyph column + one content column: every number, the moisture bar, and the
            status chip share the same vertical axis. */}
        <div className={styles.thermoRow}>
          <Glyph kind="thermometer" className={styles.glyphTemp} />
          <span>
            <span className={styles.big}>{tempC != null ? round(tempC, 1) : '—'}</span>
            <span className={styles.bigUnit}>°C</span>
          </span>
        </div>
        {rh != null && (
          <div className={styles.thermoRow}>
            <Glyph kind="droplet" className={styles.glyphDrop} />
            <div>
              <span className={styles.humidity}>{rh}%</span>
              <div className={styles.rhBar} role="img" aria-label={`Relative humidity ${rh}%`}>
                <div className={styles.rhFill} style={{ width: `${rh}%` }} />
              </div>
              {status && (
                <div className={`${styles.chips} ${styles.chipsLeft} ${styles.moistureChip}`}>
                  <span className={`${styles.chip} ${TONE_CLASS[status.tone]}`}>{status.text}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {dewpC != null ? (
          <div className={styles.thermoRow}>
            <Glyph kind="dewpoint" className={styles.glyphDew} size={16} />
            <div className={styles.miniFacts}>
              <div>
                <div className={styles.miniLabel}>Dew</div>
                <div className={styles.miniValue}>{round(dewpC, 1)}°C</div>
              </div>
              <div>
                <div className={styles.miniLabel}>Spread</div>
                <div className={styles.miniValue}>{spread}°C</div>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.sub}>Dew point not reported</div>
        )}
      </div>
    </div>
  );
}
