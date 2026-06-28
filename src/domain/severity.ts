// Shared severity ordering helpers, used by icing and risk aggregation.
import type { Severity } from './types';

export const SEVERITY_ORDER: Severity[] = ['GOOD', 'CAUTION', 'HIGH', 'NOFLY'];

export const severityRank = (s: Severity): number => SEVERITY_ORDER.indexOf(s);

/** The most severe of a list (empty -> GOOD). */
export const maxSeverity = (xs: Severity[]): Severity =>
  xs.reduce<Severity>((acc, s) => (severityRank(s) > severityRank(acc) ? s : acc), 'GOOD');

/** Raise a severity by one step, not exceeding `cap`. */
export const bumpSeverity = (s: Severity, cap: Severity = 'HIGH'): Severity =>
  SEVERITY_ORDER[Math.min(severityRank(s) + 1, severityRank(cap))];

export const SEVERITY_LABEL: Record<Severity, string> = {
  GOOD: 'Good',
  CAUTION: 'Caution',
  HIGH: 'High risk',
  NOFLY: 'No fly',
};
