import type { RiskComponent, RiskSummary as RiskSummaryT, Severity, Wind } from '../../domain/types';
import { SEVERITY_VAR } from '../../utils/severity';
import { compassPoint } from '../../domain/geo';
import { SeverityChip } from '../common/SeverityChip';
import styles from './DecisionBanner.module.css';

/** Concise "main issue" line with practical magnitude (+ compass direction for wind). */
function mainIssue(primary: RiskComponent, wind: Wind): string {
  const magnitude = primary.value ? ` — ${primary.value}` : '';
  const dir =
    primary.key === 'wind' && wind.dirDeg != null && !wind.calm
      ? ` from ${compassPoint(wind.dirDeg)}`
      : '';
  return `${primary.label}${magnitude}${dir}`;
}

/**
 * Layer 1 — the decision anchor: big GOOD/CAUTION/NO-FLY verdict, the single dominant reason with
 * its magnitude, short hedged advice, and a reduced-confidence note. Decision support only.
 */
export function DecisionBanner({
  risk,
  wind,
  secondary,
}: {
  risk: RiskSummaryT;
  wind: Wind;
  /** Secondary at-a-glance line (Iteration 2 daylight; Iteration 3 forecast). Colored when > GOOD. */
  secondary?: { text: string; severity: Severity };
}) {
  return (
    <section className={styles.wrap} style={{ borderColor: SEVERITY_VAR[risk.overall] }}>
      <div className={styles.top}>
        <SeverityChip severity={risk.overall} size="lg" />
        {risk.uncertain && <span className={styles.uncertain}>Reduced confidence</span>}
      </div>

      {risk.primary && (
        <p className={styles.issue}>
          <span className={styles.issueLabel}>Main issue:</span> {mainIssue(risk.primary, wind)}
        </p>
      )}

      <p className={styles.advice}>{risk.advice}</p>

      {secondary && (
        <p
          className={styles.secondary}
          style={secondary.severity !== 'GOOD' ? { color: SEVERITY_VAR[secondary.severity] } : undefined}
        >
          {secondary.text}
        </p>
      )}
    </section>
  );
}
