// Presentation helpers for the TAF summary — format the structured hazards into the Layer-2 strip
// line and an optional banner note. Wind/ceiling render in the user's units; times are UTC (the
// aviation convention — shown with a Z, which also sidesteps the device-local-time caveat).

import type { TafHazard, TafSummary } from '../../domain/taf';
import { fmtWindSpeed, fmtAltFt, round, type WindUnit, type AltUnit } from '../../domain/units';

const utcHour = (d: Date | null): string => (d ? String(d.getUTCHours()).padStart(2, '0') : '');

function windowLabel(h: TafHazard): string {
  if (h.changeType === 'BASE') return ''; // prevailing forecast — "now"
  if (h.changeType === 'FM') return h.from ? `from ${utcHour(h.from)}Z` : '';
  if (h.from && h.to) return `${utcHour(h.from)}–${utcHour(h.to)}Z`;
  return h.from ? `from ${utcHour(h.from)}Z` : '';
}

function changePrefix(h: TafHazard): string {
  if (h.changeType === 'PROB') return h.probPct != null ? `PROB${h.probPct}` : 'PROB';
  if (h.changeType === 'TEMPO') return 'TEMPO';
  if (h.changeType === 'BECMG') return 'BECMG';
  return '';
}

function core(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit): string {
  switch (h.kind) {
    case 'thunderstorm':
      return 'thunderstorms';
    case 'lowCeiling':
      return `ceiling ${fmtAltFt(h.ceilingFt ?? 0, altUnit)}`;
    case 'lowVis':
      return `vis ${round((h.visM ?? 0) / 1000, 1)} km`;
    case 'gusts':
      return `gusts to ${fmtWindSpeed(h.gustKt ?? 0, windUnit)}`;
    case 'strongWind':
      return `wind ${fmtWindSpeed(h.windKt ?? 0, windUnit)}`;
    case 'rain':
      return 'rain';
    case 'snow':
      return 'snow';
  }
}

function hazardPhrase(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit): string {
  return [changePrefix(h), core(h, windUnit, altUnit), windowLabel(h)].filter(Boolean).join(' ');
}

/** Compact Layer-2 strip line. Labelled as the airport forecast; top 3 hazards, then "…". */
export function tafStripText(s: TafSummary, windUnit: WindUnit, altUnit: AltUnit): string {
  const label = `TAF ${s.icao}`.trim();
  const partial = s.partial ? ' · parsed partially — check raw' : '';
  if (!s.hazards.length) {
    return `${label} · airport forecast: no significant change next ${s.horizonH} h${partial}`;
  }
  const items = s.hazards.slice(0, 3).map((h) => hazardPhrase(h, windUnit, altUnit));
  const more = s.hazards.length > 3 ? ' · …' : '';
  return `${label} · airport forecast: ${items.join(' · ')}${more}${partial}`;
}

/** Short banner note — only for a forecast thunderstorm (the most decision-relevant); null otherwise. */
export function tafBannerNote(s: TafSummary): string | null {
  const ts = s.hazards.find((h) => h.kind === 'thunderstorm');
  if (!ts) return null;
  const prob = ts.probPct != null ? `PROB${ts.probPct} ` : '';
  const w = windowLabel(ts);
  return `TAF: ${prob}possible thunderstorms${w ? ` ${w}` : ''}`;
}
