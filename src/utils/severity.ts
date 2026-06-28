import type { Severity } from '../domain/types';

/** CSS custom property per severity (defined in global.css). */
export const SEVERITY_VAR: Record<Severity, string> = {
  GOOD: 'var(--good)',
  CAUTION: 'var(--caution)',
  HIGH: 'var(--high)',
  NOFLY: 'var(--nofly)',
};

/** Display labels for the overall / component status. */
export const SEVERITY_DISPLAY: Record<Severity, string> = {
  GOOD: 'GOOD',
  CAUTION: 'CAUTION',
  HIGH: 'HIGH RISK',
  NOFLY: 'NO FLY',
};
