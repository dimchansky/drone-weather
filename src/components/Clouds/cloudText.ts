// Plain-language presentation helpers for the Cloud & ceiling card. Aviation codes (SCT, CB, the
// okta figure) are never primary UI text here — they're translated to what a drone pilot needs:
// how much sky, at what height, whether it's a ceiling, and whether a dangerous cloud type is
// present. Raw codes survive only as a dim secondary tag; the raw METAR stays verbatim elsewhere.
// Pure + table-tested (UI formats, this decides the wording). No parser or verdict change.

import type { CloudCover, CloudLayer, Severity } from '../../domain/types';
import type { ResolvedCloudBase } from '../../domain/clouds';
import { COVER_OKTAS } from '../../domain/clouds';
import { fmtAlt, fmtAltFt, type AltUnit } from '../../domain/units';

/** Human name for a cover code — the primary, non-jargon label. */
const COVER_LABEL: Record<CloudCover, string> = {
  FEW: 'Few clouds',
  SCT: 'Scattered clouds',
  BKN: 'Broken cloud',
  OVC: 'Overcast',
  VV: 'Sky obscured',
  SKC: 'Sky clear',
  CLR: 'Sky clear',
  NSC: 'No significant cloud',
  NCD: 'No cloud detected',
};

/** Plain "how much of the sky" phrase — replaces the bare okta figure as primary text. */
const SKY_AMOUNT: Partial<Record<CloudCover, string>> = {
  FEW: 'a few patches',
  SCT: 'up to about half the sky',
  BKN: 'most of the sky',
  OVC: 'the whole sky',
};

/** Covers that constitute a ceiling (broken/overcast or sky obscured) — SCT/FEW never do. */
const CEILING_COVERS = new Set<CloudCover>(['BKN', 'OVC', 'VV']);

export function coverLabel(cover: CloudCover): string {
  return COVER_LABEL[cover] ?? cover;
}

export function skyAmountPhrase(cover: CloudCover): string {
  return SKY_AMOUNT[cover] ?? '';
}

/** Primary layer headline, e.g. "Scattered clouds — up to about half the sky" / "Sky obscured". */
export function layerHeadline(cover: CloudCover): string {
  const amount = skyAmountPhrase(cover);
  return amount ? `${coverLabel(cover)} — ${amount}` : coverLabel(cover);
}

/** Coverage as an eighths-of-sky fraction for the dim secondary tag ("3–4/8"); '' when N/A. */
export function coverFraction(cover: CloudCover): string {
  const oktas = COVER_OKTAS[cover];
  return oktas && cover !== 'VV' ? `${oktas}/8` : '';
}

/** Whether this cover is a ceiling (BKN/OVC/VV) — used to mark ceiling layers. */
export function isCeilingCover(cover: CloudCover): boolean {
  return CEILING_COVERS.has(cover);
}

/** Dim, secondary raw-code tag preserving the original codes for verification, e.g. "SCT · 3–4/8 · CB". */
export function layerRawTag(layer: CloudLayer): string {
  const parts: string[] = [layer.cover];
  const frac = coverFraction(layer.cover);
  if (frac) parts.push(frac);
  if (layer.cb) parts.push('CB');
  else if (layer.tcu) parts.push('TCU');
  return parts.join(' · ');
}

export interface CloudCallout {
  severity: Severity;
  text: string;
}

const heightPhrase = (baseFt: number | null, altUnit: AltUnit): string =>
  baseFt != null ? ` at ${fmtAltFt(baseFt, altUnit)} above ground` : '';

/**
 * Explained, highlighted callouts for dangerous cloud types. CB (cumulonimbus) is a thunderstorm
 * cloud → NO-FLY-coloured (it already drives the verdict via hasThunderstorm). TCU (towering
 * cumulus) is building convection → CAUTION-coloured in the card only (verdict unchanged — see the
 * TCU risk-engine follow-up in docs/todo.md). Lowest base of each type is quoted. [] when neither.
 */
export function convectiveCallout(clouds: CloudLayer[], altUnit: AltUnit): CloudCallout[] {
  const out: CloudCallout[] = [];
  const lowest = (pred: (l: CloudLayer) => boolean): number | null => {
    const bases = clouds.filter((l) => pred(l) && l.baseFt != null).map((l) => l.baseFt as number);
    return bases.length ? Math.min(...bases) : null;
  };

  if (clouds.some((l) => l.cb)) {
    out.push({
      severity: 'NOFLY',
      text: `Cumulonimbus (CB) — thunderstorm cloud${heightPhrase(lowest((l) => l.cb), altUnit)}. Thunderstorms mean no-fly.`,
    });
  }
  if (clouds.some((l) => l.tcu && !l.cb)) {
    out.push({
      severity: 'CAUTION',
      text: `Towering cumulus (TCU) — building storm cloud${heightPhrase(lowest((l) => l.tcu && !l.cb), altUnit)}. Convection developing; treat with caution.`,
    });
  }
  return out;
}

const HEDGE: Partial<Record<ResolvedCloudBase['kind'], string>> = {
  cavok: '≥ ',
  model: '~',
  estimate: '≈',
};

/**
 * One plain line tying the resolved cloud base to the drone operating band. Reuses the same
 * resolved base + ops-ceiling the VerticalHazardStrip and ceiling-risk row use, so they never
 * contradict; hedged (~/≈/≥) per source. null when there's no usable base to talk about.
 */
export function droneRelevanceLine(
  cb: ResolvedCloudBase,
  opsCeilingM: number,
  altUnit: AltUnit,
): string | null {
  const ops = fmtAlt(opsCeilingM, altUnit);
  if (cb.kind === 'none-low') return `Cloud is clear or a high base — nothing near your ${ops} operating band.`;
  if (cb.baseM == null || cb.baseFt == null) return null;

  const base = `${HEDGE[cb.kind] ?? ''}${fmtAltFt(cb.baseFt, altUnit)}`;
  if (cb.baseM <= opsCeilingM) {
    return `Cloud base ${base} above ground is within your ${ops} operating band — you could be flying into cloud.`;
  }
  if (cb.baseM <= opsCeilingM + 150) {
    return `Cloud base ${base} above ground is only just above your ${ops} operating band.`;
  }
  return `Cloud base ${base} above ground is well above your ${ops} operating band.`;
}
