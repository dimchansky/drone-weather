// Presentation helpers for the TAF summary. The compact strip renders a GROUPED, scannable list —
// one short line per hazard type (all shown, never a bare "+N more"), plus a computed worst-overlap
// / hazard-span line so the pilot sees when it's worst and when it's clear. Uncertainty is conveyed
// once (the "airport forecast" label + inline "N% chance"), not repeated as "possible at times".

import type { TafHazard, TafHazardKind, TafSummary } from '../../domain/taf';
import type { LocationTime } from '../../domain/types';
import { fmtWindSpeed, fmtAltFt, round, type WindUnit, type AltUnit } from '../../domain/units';
import { fmtTimeInZone, fmtUtcTime, timeSourceLabel } from '../../utils/time';

/**
 * "11:00–13:00 (08:00–10:00 UTC)" — flight-site local time primary, UTC secondary. A single time
 * (to=null, e.g. FM) → "14:00 (14:00 UTC)". Used by the TAF details card.
 */
export function windowLocalUtc(from: Date | null, to: Date | null, lt: LocationTime): string {
  const l = (d: Date): string => fmtTimeInZone(d, lt);
  const u = (d: Date): string => fmtUtcTime(d).replace('Z', '');
  const local = from && to ? `${l(from)}–${l(to)}` : from ? l(from) : '';
  const utc = from && to ? `${u(from)}–${u(to)} UTC` : from ? `${u(from)} UTC` : '';
  return local ? `${local} (${utc})` : '';
}

/** Local-only window "15:00–00:00" / "from 14:00" (strip + banner; UTC lives in the details card). */
export function windowLocal(from: Date | null, to: Date | null, lt: LocationTime): string {
  const l = (d: Date): string => fmtTimeInZone(d, lt);
  return from && to ? `${l(from)}–${l(to)}` : from ? `from ${l(from)}` : '';
}

// Exported: the forecast timeline's TAF band uses the same human hazard names.
export const HAZARD_LABEL: Record<TafHazardKind, string> = {
  thunderstorm: 'Thunderstorms',
  lowCeiling: 'Low cloud',
  lowVis: 'Visibility',
  gusts: 'Gusts',
  strongWind: 'Strong wind',
  rain: 'Rain',
  snow: 'Snow',
};

function hazardValue(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit): string {
  switch (h.kind) {
    case 'lowCeiling':
      return `ceiling ${fmtAltFt(h.ceilingFt ?? 0, altUnit)}`;
    case 'lowVis':
      return `down to ${round((h.visM ?? 0) / 1000, 1)} km`;
    case 'gusts':
      return `to ${fmtWindSpeed(h.gustKt ?? 0, windUnit)}`;
    case 'strongWind':
      return fmtWindSpeed(h.windKt ?? 0, windUnit);
    default:
      return '';
  }
}

/** One grouped hazard line: "Thunderstorms — 15:00–00:00", "Low cloud (30% chance) — ceiling 61 m · 23:00–06:00". */
export function hazardGroupLine(h: TafHazard, windUnit: WindUnit, altUnit: AltUnit, lt: LocationTime): string {
  const prob = h.changeType === 'PROB' && h.probPct != null ? ` (${h.probPct}% chance)` : '';
  const label = `${HAZARD_LABEL[h.kind]}${prob}`;
  const detail = [hazardValue(h, windUnit, altUnit), windowLocal(h.from, h.to, lt)].filter(Boolean).join(' · ');
  return detail ? `${label} — ${detail}` : label;
}

/** The worst-overlap / hazard-span line, e.g. "⚠ Worst ~23:00–00:00 · hazards 15:00–06:00"; null when not useful. */
export function worstWindowLine(s: TafSummary, lt: LocationTime): string | null {
  if (s.worstWindow) {
    const worst = windowLocal(s.worstWindow.from, s.worstWindow.to, lt);
    const span = s.hazardSpan ? ` · hazards ${windowLocal(s.hazardSpan.from, s.hazardSpan.to, lt)}` : '';
    return `⚠ Worst ~${worst}${span}`;
  }
  if (s.hazards.length >= 2 && s.hazardSpan) {
    return `Hazards ${windowLocal(s.hazardSpan.from, s.hazardSpan.to, lt)}`;
  }
  return null;
}

/** Strip header line: "TAF EYVI · airport forecast · times Europe/Vilnius". */
export function tafStripHeader(s: TafSummary, lt: LocationTime): string {
  const icao = s.icao ? `TAF ${s.icao}` : 'TAF';
  return `${icao} · airport forecast · times ${timeSourceLabel(lt)}`;
}

const SERIOUS: TafHazardKind[] = ['thunderstorm', 'lowCeiling', 'lowVis'];

/**
 * Short banner note — the single most important TAF hazard (thunderstorm / low cloud / poor
 * visibility), one clause, confidence-worded (no repeated "at times"); null when none is serious.
 */
export function tafBannerNote(s: TafSummary, lt: LocationTime, altUnit: AltUnit): string | null {
  const h = s.hazards.find((x) => SERIOUS.includes(x.kind)); // hazards are severity-ordered → first serious = worst
  if (!h) return null;
  const noun =
    h.kind === 'thunderstorm'
      ? 'thunderstorms'
      : h.kind === 'lowCeiling'
        ? `low cloud (ceiling ${fmtAltFt(h.ceilingFt ?? 0, altUnit)})`
        : `poor visibility (${round((h.visM ?? 0) / 1000, 1)} km)`;
  const conf =
    h.changeType === 'PROB' && h.probPct != null
      ? `${h.probPct}% chance of ${noun}`
      : h.tempo
        ? `${noun} possible`
        : `${noun} expected`;
  const win = windowLocal(h.from, h.to, lt);
  return `TAF: ${conf}${win ? ` ${win}` : ''}`;
}
