// Presentation helpers for the TAF summary — turn the structured hazards into plain, non-aviation
// language: human local-time windows (device-local primary, UTC secondary), jargon expanded
// (TEMPO → "possible at times", PROB30 → "30% chance", BECMG → "becoming", FM → "from"), same-kind
// hazards aggregated in the domain, and an explicit "+N more" instead of a bare ellipsis.

import type { TafHazard, TafSummary } from '../../domain/taf';
import type { LocationTime } from '../../domain/types';
import { fmtWindSpeed, fmtAltFt, round, type WindUnit, type AltUnit } from '../../domain/units';
import { fmtTimeInZone, fmtUtcTime } from '../../utils/time';

const MAX_SHOWN = 3;

/**
 * "11:00–13:00 (08:00–10:00 UTC)" — flight-site local time primary, UTC secondary (TAF is native
 * UTC). A single time (to=null, e.g. FM) → "14:00 (14:00 UTC)". Shared with the TAF details card.
 */
export function windowLocalUtc(from: Date | null, to: Date | null, lt: LocationTime): string {
  const l = (d: Date): string => fmtTimeInZone(d, lt);
  const u = (d: Date): string => fmtUtcTime(d).replace('Z', '');
  const local = from && to ? `${l(from)}–${l(to)}` : from ? l(from) : '';
  const utc = from && to ? `${u(from)}–${u(to)} UTC` : from ? `${u(from)} UTC` : '';
  return local ? `${local} (${utc})` : '';
}

function hazardNoun(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit): string {
  switch (h.kind) {
    case 'thunderstorm':
      return 'thunderstorms';
    case 'lowCeiling':
      return `low cloud (ceiling ${fmtAltFt(h.ceilingFt ?? 0, altUnit)})`;
    case 'lowVis':
      return `reduced visibility (${round((h.visM ?? 0) / 1000, 1)} km)`;
    case 'gusts':
      return `gusts to ${fmtWindSpeed(h.gustKt ?? 0, windUnit)}`;
    case 'strongWind':
      return `strong wind ${fmtWindSpeed(h.windKt ?? 0, windUnit)}`;
    case 'rain':
      return 'rain';
    case 'snow':
      return 'snow';
  }
}

/** A full plain-language hazard phrase, e.g. "thunderstorms possible at times 11:00–17:00 (08:00–14:00 UTC)". */
export function hazardPhrase(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit, lt: LocationTime): string {
  const noun = hazardNoun(h, windUnit, altUnit);
  const win = windowLocalUtc(h.from, h.to, lt);

  if (h.changeType === 'PROB' && h.probPct != null) {
    const atTimes = h.tempo ? 'at times ' : '';
    return `${h.probPct}% chance of ${noun} ${atTimes}${win}`.trim();
  }
  if (h.changeType === 'TEMPO' || h.tempo) {
    return `${noun} possible at times ${win}`.trim();
  }
  if (h.changeType === 'BECMG') {
    return win ? `${noun} becoming ${win}` : `${noun} becoming`;
  }
  if (h.changeType === 'FM') {
    return win ? `${noun} from ${win}` : noun;
  }
  return win ? `${noun} ${win}` : noun; // BASE (prevailing)
}

/** Compact Layer-2 strip line — plain language, airport-labelled, top few hazards + explicit "+N more". */
export function tafStripText(s: TafSummary, windUnit: WindUnit, altUnit: AltUnit, lt: LocationTime): string {
  const label = `TAF ${s.icao}`.trim();
  const partial = s.partial ? ' · parsed partially — check raw' : '';
  if (!s.hazards.length) {
    return `${label} · airport forecast: no significant change next ${s.horizonH} h${partial}`;
  }
  const shown = s.hazards.slice(0, MAX_SHOWN).map((h) => hazardPhrase(h, windUnit, altUnit, lt));
  const hidden = s.hazards.length - MAX_SHOWN;
  const more = hidden > 0 ? ` · +${hidden} more TAF hazard${hidden > 1 ? 's' : ''}` : '';
  return `${label} · airport forecast: ${shown.join(' · ')}${more}${partial}`;
}

/** Short banner note — only for a forecast thunderstorm (the most decision-relevant); null otherwise. */
export function tafBannerNote(s: TafSummary, lt: LocationTime): string | null {
  const ts = s.hazards.find((h) => h.kind === 'thunderstorm');
  return ts ? `TAF: ${hazardPhrase(ts, 'kt', 'ft', lt)}` : null;
}
