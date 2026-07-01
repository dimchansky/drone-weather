import type { PrecipNow } from '../../domain/precip';
import type { Severity } from '../../domain/types';
import { InfoStrip } from '../common/InfoStrip';

/**
 * Layer 2 — "is it (going to be) wet now?" as a standalone, honestly-sourced strip. Observed METAR
 * precip reads HIGH; a model amount reads HIGH; a model probability reads CAUTION; none is neutral.
 * The text (from precipNow) always names the source, so a model chance never looks observed.
 */
export function PrecipNowPill({ precip }: { precip: PrecipNow }) {
  const severity: Severity | undefined =
    precip.source === 'metar'
      ? 'HIGH'
      : precip.source === 'model'
        ? precip.raining
          ? 'HIGH'
          : 'CAUTION'
        : undefined; // 'none' → neutral, no dot

  return (
    <InfoStrip severity={severity} title="Precipitation now">
      {precip.text}
    </InfoStrip>
  );
}
