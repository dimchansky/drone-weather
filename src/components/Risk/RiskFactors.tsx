import type { RiskSummary as RiskSummaryT } from '../../domain/types';
import { Card } from '../common/Card';
import { SeverityDot } from '../common/SeverityChip';
import styles from './RiskFactors.module.css';

/** The weather factors shown as scannable rows (freshness/distance live in the status strip). */
const WEATHER_KEYS = new Set(['wind', 'gust', 'visibility', 'precip', 'moisture', 'ceiling', 'icing']);

/**
 * Layer 2 — the priority-ordered weather risk factors, each with its own reason (never a black
 * box). Confidence factors (freshness/distance) are surfaced by the StatusStrip instead.
 */
export function RiskFactors({ risk }: { risk: RiskSummaryT }) {
  const rows = risk.components.filter((c) => WEATHER_KEYS.has(c.key));
  return (
    <Card title="Risk factors">
      <ul className={styles.list}>
        {rows.map((c) => (
          <li key={c.key} className={styles.item}>
            <div className={styles.itemHead}>
              <SeverityDot severity={c.severity} />
              <span className={styles.label}>{c.label}</span>
              {c.value && <span className={styles.value}>{c.value}</span>}
            </div>
            <p className={styles.reason}>{c.reason}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
