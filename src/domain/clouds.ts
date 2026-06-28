// Cloud layer / ceiling / cloud-base logic. See docs/spec.md §4.5 and
// docs/initial-idea.md §7.5.

import type { CloudCover, CloudLayer, Metar } from './types';
import { ftToM, mToFt } from './units';

/** Covers that constitute a ceiling (broken/overcast or sky obscured). */
const CEILING_COVERS = new Set<CloudCover>(['BKN', 'OVC', 'VV']);

/** Oktas (eighths of sky) for each cover, for display/interpretation. */
export const COVER_OKTAS: Record<string, string> = {
  FEW: '1–2',
  SCT: '3–4',
  BKN: '5–7',
  OVC: '8',
  VV: 'obscured',
};

/** Build a CloudLayer, deriving metres from feet. */
export function makeCloudLayer(
  cover: CloudCover,
  baseFt: number | null,
  opts: { cb?: boolean; tcu?: boolean } = {},
): CloudLayer {
  return {
    cover,
    baseFt,
    baseM: baseFt == null ? null : Math.round(ftToM(baseFt)),
    cb: opts.cb ?? false,
    tcu: opts.tcu ?? false,
  };
}

/** Operational ceiling in feet AGL: the lowest BKN/OVC/VV layer, else null. */
export function ceilingFt(layers: CloudLayer[]): number | null {
  const bases = layers
    .filter((l) => CEILING_COVERS.has(l.cover) && l.baseFt != null)
    .map((l) => l.baseFt as number);
  return bases.length ? Math.min(...bases) : null;
}

/** Espy's estimate of cloud base in metres AGL from the dew point spread. */
export function estimatedCloudBaseM(tempC: number, dewpC: number): number {
  return Math.max(0, 125 * (tempC - dewpC));
}

export type CloudBaseKind = 'actual' | 'cavok' | 'estimate' | 'none';

export interface ResolvedCloudBase {
  kind: CloudBaseKind;
  baseFt: number | null;
  baseM: number | null;
  note: string;
}

/**
 * Resolve the cloud base to display, by priority:
 *   1. actual METAR cloud layers (lowest reported base),
 *   2. CAVOK (no significant cloud below 5000 ft AGL),
 *   3. estimate from dew point spread (clearly approximate).
 */
export function resolveCloudBase(metar: Metar): ResolvedCloudBase {
  const reported = metar.clouds.filter((l) => l.baseFt != null);
  if (reported.length) {
    const lowest = reported.reduce((a, b) =>
      (a.baseFt as number) <= (b.baseFt as number) ? a : b,
    );
    const hundreds = String(Math.round((lowest.baseFt as number) / 100)).padStart(3, '0');
    return {
      kind: 'actual',
      baseFt: lowest.baseFt,
      baseM: lowest.baseM,
      note: `Lowest reported layer ${lowest.cover}${hundreds}`,
    };
  }

  if (metar.cavok) {
    return {
      kind: 'cavok',
      baseFt: 5000,
      baseM: Math.round(ftToM(5000)),
      note: 'CAVOK: no significant cloud below 5000 ft AGL',
    };
  }

  if (metar.tempC != null && metar.dewpC != null) {
    const m = estimatedCloudBaseM(metar.tempC, metar.dewpC);
    return {
      kind: 'estimate',
      baseFt: Math.round(mToFt(m)),
      baseM: Math.round(m),
      note: 'Estimated from dew point spread (≈125 m × (T − Td)) — approximate',
    };
  }

  return { kind: 'none', baseFt: null, baseM: null, note: 'No cloud information available' };
}
