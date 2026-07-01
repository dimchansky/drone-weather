import type { TafSummary } from '../../domain/taf';
import type { WindUnit, AltUnit } from '../../domain/units';
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
}: {
  summary: TafSummary;
  windUnit: WindUnit;
  altUnit: AltUnit;
}) {
  if (!summary.available) return null;
  return (
    <InfoStrip
      severity={summary.severity}
      title="TAF — airport forecast, not your exact launch point (times UTC)"
    >
      {tafStripText(summary, windUnit, altUnit)}
    </InfoStrip>
  );
}
