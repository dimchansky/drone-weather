import type { RiskSummary as RiskSummaryT } from '../../domain/types';
import { SEVERITY_VAR } from '../../utils/severity';
import { SeverityChip, SeverityDot } from '../common/SeverityChip';
import styles from './RiskSummary.module.css';

export function RiskSummary({ risk }: { risk: RiskSummaryT }) {
  return (
    <section className={styles.wrap} style={{ borderColor: SEVERITY_VAR[risk.overall] }}>
      <div className={styles.top}>
        <SeverityChip severity={risk.overall} size="lg" />
        {risk.uncertain && <span className={styles.uncertain}>Reduced confidence</span>}
      </div>

      <p className={styles.headline}>{risk.headline}</p>

      <ul className={styles.list}>
        {risk.components.map((c) => (
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
    </section>
  );
}
