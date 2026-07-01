import type { TafSummary } from '../../domain/taf';
import type { LocationTime } from '../../domain/types';
import type { WindUnit, AltUnit } from '../../domain/units';
import { timeSourceLabel } from '../../utils/time';
import { InfoStrip } from '../common/InfoStrip';
import { tafStripText } from './tafText';

/**
 * Layer 2 — the aviation TAF as a compact, source-labelled forecast: near-term hazards (wind/gusts,
 * rain/snow, thunderstorms, low ceiling, poor visibility). It is the AIRPORT forecast (not your
 * exact launch point) and advisory-only (colored CAUTION at most); it never changes the observed
 * verdict. Kept separate from the Open-Meteo point forecast — both are shown, each source-labelled.
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
  return (
    <InfoStrip
      severity={summary.severity}
      title={`TAF — airport forecast, not your exact launch point. Times in ${timeSourceLabel(locationTime)} (UTC in parentheses).`}
    >
      {tafStripText(summary, windUnit, altUnit, locationTime)}
    </InfoStrip>
  );
}
