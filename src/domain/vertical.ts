// Vertical-hazard conclusion for the ops band — the one-line summary shown in Layer 2 so the
// app's unique vertical signal stays visible even when the full analyzer chart is collapsed.
// Pure: reuses the icing band levels + the resolved cloud base. UI formats, this decides.

import type { Severity } from './types';
import { fmtAlt, type AltUnit } from './units';
import { maxSeverity } from './severity';
import type { IcingLevel } from './icing';

export interface VerticalHazard {
  severity: Severity;
  text: string;
}

/** Icing vocabulary (matches the analyzer legend) rather than the generic severity words. */
const ICING_WORD: Record<Severity, string> = {
  GOOD: 'low',
  CAUTION: 'moderate',
  HIGH: 'high',
  NOFLY: 'severe',
};

/**
 * Summarize the vertical hazard within the operating band (0…opsCeilingM): the worst icing
 * severity among levels in the band, plus whether the resolved cloud base sits within it (you
 * would fly into cloud). Hazards above the ops band are intentionally excluded — this is the
 * band the drone actually flies in.
 */
export function opsBandHazard(
  icingLevels: IcingLevel[],
  cloudBaseM: number | null,
  opsCeilingM: number,
  altUnit: AltUnit = 'm',
): VerticalHazard {
  const band = icingLevels.filter((l) => l.altM <= opsCeilingM);
  const icingWorst = maxSeverity(band.map((l) => l.severity));

  const hazardTxt =
    icingWorst === 'GOOD' ? 'low vertical hazard' : `${ICING_WORD[icingWorst]} icing risk`;

  const cloudImmersion = cloudBaseM != null && cloudBaseM <= opsCeilingM;
  const cloudTxt =
    cloudBaseM == null
      ? null
      : cloudImmersion
        ? 'cloud base within the band'
        : 'cloud base above ops ceiling';

  const bandTxt = `Ops band 0–${fmtAlt(opsCeilingM, altUnit)}`;
  const text = cloudTxt ? `${bandTxt}: ${hazardTxt} · ${cloudTxt}` : `${bandTxt}: ${hazardTxt}`;

  const severity = maxSeverity([icingWorst, cloudImmersion ? 'HIGH' : 'GOOD']);
  return { severity, text };
}
