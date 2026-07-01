import type { Brief } from '../../domain/brief';
import type { Confidence, Severity } from '../../domain/types';
import { round, hpaToInhg } from '../../domain/units';
import { ageMinutes, fmtTimeInZone, timeSourceLabel } from '../../utils/time';
import { InfoStrip } from '../common/InfoStrip';

const CONF_SEVERITY: Record<Confidence, Severity> = { OK: 'GOOD', REDUCED: 'CAUTION', LOW: 'HIGH' };

/**
 * Layer 2 — compact data-confidence strip, always visible so the pilot immediately sees how
 * trustworthy the brief is: which station, how far, how old, when fetched, and (METAR only) QNH.
 * QNH is a METAR-derived altimeter setting — it is never synthesized for a model-only brief.
 * Clock times are shown in the flight-site local zone (device-local fallback), named at the end.
 */
export function StatusStrip({ brief, now }: { brief: Brief; now: Date }) {
  const { risk, source, station, metar, fetchedAt, locationTime } = brief;
  const clock = (d: Date) => fmtTimeInZone(d, locationTime);
  const parts: string[] = [];

  if (source === 'metar') {
    if (station) {
      parts.push(station.icao);
      parts.push(`${round(station.distanceKm)} km`);
    }
    parts.push(`METAR ${ageMinutes(metar.observedAt, now)} min old`);
    parts.push(`fetched ${clock(fetchedAt)}`);
    if (metar.qnhHpa != null) {
      parts.push(`QNH ${metar.qnhHpa} hPa (${round(hpaToInhg(metar.qnhHpa), 2)} inHg)`);
    }
  } else {
    parts.push('Model only');
    parts.push('no nearby METAR');
    parts.push(`model time ${clock(metar.observedAt)}`);
    parts.push(`fetched ${clock(fetchedAt)}`);
    // No QNH here — it implies a METAR-derived altimeter setting, which a model brief lacks.
  }
  parts.push(`times ${timeSourceLabel(locationTime)}`);

  return (
    <InfoStrip severity={CONF_SEVERITY[risk.confidence]} title={`Data confidence: ${risk.confidence}`}>
      {parts.join(' · ')}
    </InfoStrip>
  );
}
