import type { TafSummary } from '../../domain/taf';
import type { LocationTime } from '../../domain/types';
import type { WindUnit, AltUnit } from '../../domain/units';
import { SEVERITY_VAR } from '../../utils/severity';
import { tafStripHeader, hazardGroupLine, worstWindowLine } from './tafText';
import styles from './TafStrip.module.css';

/**
 * Layer 2 — the aviation TAF as a compact but SCANNABLE hazard summary: a header, one short line per
 * hazard type (all shown — never a bare "+N more"), and a computed worst-overlap / hazard-span line
 * so the pilot sees when it's worst and when it's clear. Airport forecast, advisory-only (colored
 * CAUTION at most); it never changes the observed verdict. The full period-by-period breakdown +
 * UTC times live in the collapsible TAF details card; the raw TAF stays verbatim.
 */
export function TafStrip({
  summary,
  windUnit,
  altUnit,
  locationTime,
}: {
  summary: TafSummary;
  windUnit: WindUnit;
  altUnit: AltUnit;
  locationTime: LocationTime;
}) {
  if (!summary.available) return null;
  const header = tafStripHeader(summary, locationTime);
  const style = { borderLeftColor: SEVERITY_VAR[summary.severity] };
  const partial = summary.partial ? ' · parsed partially — check raw' : '';

  if (!summary.hazards.length) {
    return (
      <div className={styles.strip} style={style} title="TAF — airport forecast, not your exact launch point">
        <p className={styles.oneLine}>
          {header}: no significant change next {summary.horizonH} h{partial}
        </p>
      </div>
    );
  }

  const worst = worstWindowLine(summary, locationTime);
  return (
    <div className={styles.strip} style={style} title="TAF — airport forecast, not your exact launch point">
      <p className={styles.header}>{header}</p>
      <ul className={styles.hazards}>
        {summary.hazards.map((h, i) => (
          <li key={i} className={styles.hazard}>
            {hazardGroupLine(h, windUnit, altUnit, locationTime)}
          </li>
        ))}
      </ul>
      {worst && <p className={styles.worst}>{worst}</p>}
      {summary.partial && <p className={styles.partialNote}>TAF parsed partially — check the raw TAF.</p>}
    </div>
  );
}
