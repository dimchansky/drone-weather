import type { ReactNode } from 'react';
import type { Severity } from '../../domain/types';
import { SEVERITY_VAR } from '../../utils/severity';
import { SeverityDot } from './SeverityChip';
import styles from './InfoStrip.module.css';

/**
 * A compact, always-visible single-line strip for Layer 2 (data confidence, precip-now, vertical
 * hazard). Optionally colored by severity via a left accent + dot (color is never the only signal —
 * the text carries the facts).
 */
export function InfoStrip({
  severity,
  title,
  children,
}: {
  severity?: Severity;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.strip}
      style={severity ? { borderLeftColor: SEVERITY_VAR[severity] } : undefined}
      title={title}
    >
      {severity && <SeverityDot severity={severity} />}
      <span className={styles.text}>{children}</span>
    </div>
  );
}
