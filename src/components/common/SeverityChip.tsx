import type { Severity } from '../../domain/types';
import { SEVERITY_VAR, SEVERITY_DISPLAY } from '../../utils/severity';
import styles from './SeverityChip.module.css';

interface Props {
  severity: Severity;
  label?: string;
  size?: 'sm' | 'lg';
}

export function SeverityChip({ severity, label, size = 'sm' }: Props) {
  return (
    <span
      className={`${styles.chip} ${size === 'lg' ? styles.lg : ''}`}
      style={{ background: SEVERITY_VAR[severity] }}
    >
      {label ?? SEVERITY_DISPLAY[severity]}
    </span>
  );
}

/** A small colored dot for inline severity indication. */
export function SeverityDot({ severity }: { severity: Severity }) {
  return <span className={styles.dot} style={{ background: SEVERITY_VAR[severity] }} aria-hidden />;
}
