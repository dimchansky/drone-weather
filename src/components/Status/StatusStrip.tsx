import type { Brief } from '../../domain/brief';
import type { Confidence, Severity } from '../../domain/types';
import { round, hpaToInhg } from '../../domain/units';
import { ageMinutes, fmtTimeInZone, timeSourceLabel } from '../../utils/time';
import { InfoStrip } from '../common/InfoStrip';

const CONF_SEVERITY: Record<Confidence, Severity> = { OK: 'GOOD', REDUCED: 'CAUTION', LOW: 'HIGH' };

/**
 * Layer 2 — compact data-confidence strip: how trustworthy the brief is. Slimmed after the
 * header gained the station · distance · updated line — this strip keeps only the facts the
 * header does NOT show: METAR observation age, QNH (METAR-derived only — never synthesized for
 * a model brief), the source, and the timezone disclosure.
 */
export function StatusStrip({ brief, now }: { brief: Brief; now: Date }) {
  const { risk, source, metar, locationTime } = brief;
  const clock = (d: Date) => fmtTimeInZone(d, locationTime);
  const parts: string[] = [];

  if (source === 'metar') {
    parts.push(`METAR ${ageMinutes(metar.observedAt, now)} min old`);
    if (metar.qnhHpa != null) {
      parts.push(`QNH ${metar.qnhHpa} hPa (${round(hpaToInhg(metar.qnhHpa), 2)} inHg)`);
    }
  } else {
    parts.push('Model only — no nearby METAR');
    parts.push(`model time ${clock(metar.observedAt)}`);
    // No QNH here — it implies a METAR-derived altimeter setting, which a model brief lacks.
  }
  parts.push(`times ${timeSourceLabel(locationTime)}`);

  return (
    <InfoStrip severity={CONF_SEVERITY[risk.confidence]} title={`Data confidence: ${risk.confidence}`}>
      {parts.join(' · ')}
    </InfoStrip>
  );
}
