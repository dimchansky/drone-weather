import { Card } from '../common/Card';
import type { ParsedTaf } from '../../domain/taf';
import type { LocationTime } from '../../domain/types';
import type { WindUnit, AltUnit } from '../../domain/units';
import { timeSourceLabel } from '../../utils/time';
import { windowLocalUtc } from './tafText';
import { periodTypeLabel, periodDetailBits } from './tafDetail';
import styles from './TafDetailsCard.module.css';

/**
 * Layer 3 — a decoded, period-by-period TAF view between the compact TafStrip (Layer 2) and the raw
 * TAF card. Plain language, location-time windows (UTC secondary), unit-aware. It is a DECODED
 * HELPER, not the source of truth: the raw TAF stays verbatim in the Raw card, and this never
 * changes the weather verdict. Airport forecast — not exact conditions at the launch point.
 */
export function TafDetailsCard({
  taf,
  windUnit,
  altUnit,
  locationTime,
}: {
  taf: ParsedTaf | null;
  windUnit: WindUnit;
  altUnit: AltUnit;
  locationTime: LocationTime;
}) {
  if (!taf || taf.periods.length === 0) return null;

  return (
    <Card title="TAF details" collapsible defaultOpen={false}>
      <p className={styles.note}>
        {taf.icao ? `${taf.icao} · ` : ''}airport forecast — not exact conditions at your launch
        point. Times in {timeSourceLabel(locationTime)} (UTC in parentheses).
      </p>

      {taf.warnings.length > 0 && (
        <p className={styles.partial}>TAF parsed partially — check the raw TAF below.</p>
      )}

      <ol className={styles.periods}>
        {taf.periods.map((pd, i) => {
          const win = windowLocalUtc(pd.from, pd.to, locationTime);
          const bits = periodDetailBits(pd, windUnit, altUnit);
          return (
            <li key={i} className={styles.period}>
              <div className={styles.head}>
                <span className={styles.type}>{periodTypeLabel(pd)}</span>
                {win && <span className={styles.window}>{win}</span>}
              </div>
              <p className={styles.bits}>
                {bits.length ? bits.join(' · ') : 'No significant change specified.'}
              </p>
              {pd.raw && <p className={styles.raw}>{pd.raw}</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
