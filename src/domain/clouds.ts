// Cloud layer / ceiling / cloud-base logic. See docs/spec.md §4.5 and
// docs/initial-idea.md §7.5.

import type { CloudCover, CloudLayer, Metar, VerticalProfile } from './types';
import { ftToM, mToFt } from './units';
import { detectInversion } from './profile';
import { spreadWidensWithHeight } from './saturation';

/** Covers that constitute a ceiling (broken/overcast or sky obscured). */
const CEILING_COVERS = new Set<CloudCover>(['BKN', 'OVC', 'VV']);

/** Codes that are an explicit observation of no significant cloud. */
const SKY_CLEAR_COVERS = new Set<CloudCover>(['SKC', 'CLR', 'NSC', 'NCD']);

/** Model cloud-cover (%) at a pressure level that counts as a significant cloud base. */
const SIGNIFICANT_CLOUD_PCT = 50;

// --- Espy estimate gating (anti-false-precision). See docs/cloud-base-research.md §3.3/§5. ---
/** Espy base at/above this (≈ spread ≥ 12 °C) is false precision → report "no significant low cloud". */
const HIGH_BASE_M = 1500;
/** "Spread is large" for the model-corroborated gate (Espy ≈ 1000 m). */
const DRY_SPREAD_C = 8;
/** Model low-cloud cover below this counts as effectively no low cloud. */
const WEAK_LOW_CLOUD_PCT = 25;
/** Surface spread at/below this means a low Espy base is meaningful — keep the estimate. */
const NEAR_SAT_SPREAD_C = 2;
/** Band (m AGL) scanned for model low cloud when deciding whether to gate. */
const LOW_CLOUD_CAP_M = 2000;

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

export type CloudBaseKind = 'actual' | 'cavok' | 'model' | 'estimate' | 'none-low' | 'none';

export interface ResolvedCloudBase {
  kind: CloudBaseKind;
  baseFt: number | null;
  baseM: number | null;
  note: string;
  /** Spread-based estimate is unreliable here (inversion / spread not closing with height). */
  unreliable?: boolean;
}

/**
 * Resolve the cloud base to display, by source priority:
 *   1. actual METAR cloud layers (lowest reported base),
 *   2. CAVOK (no significant cloud below 5000 ft AGL),
 *   3. model cloud profile (lowest pressure level with significant cloud — coarse),
 *   4. estimate from dew point spread (clearly approximate), GATED so a large/dry spread with no
 *      model or observed low cloud reports "no significant low cloud" instead of a false-precise
 *      multi-km number (see docs/cloud-base-research.md §3.3).
 */
export function resolveCloudBase(metar: Metar, profile?: VerticalProfile): ResolvedCloudBase {
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

  // Explicit sky-clear codes (SKC/CLR/NSC/NCD) are an OBSERVATION of no significant cloud — trust
  // them over the model or a spread estimate (which would otherwise invent a base from humidity).
  if (metar.clouds.some((c) => SKY_CLEAR_COVERS.has(c.cover))) {
    return {
      kind: 'none-low',
      baseFt: null,
      baseM: null,
      note: 'Sky reported clear (SKC/CLR/NSC/NCD) — no significant low cloud.',
    };
  }

  // Model tier: lowest pressure level reporting significant cloud cover. Coarse (model-level
  // resolution), so it can't pinpoint a sub-500 m base — labelled accordingly.
  if (profile?.source === 'model') {
    const lev = profile.levels.find(
      (l) => l.cloudPct != null && (l.cloudPct as number) >= SIGNIFICANT_CLOUD_PCT,
    );
    if (lev) {
      return {
        kind: 'model',
        baseFt: Math.round(mToFt(lev.altM)),
        baseM: Math.round(lev.altM),
        note: `Model: ~${Math.round(lev.cloudPct as number)}% cloud near ${Math.round(lev.altM)} m AGL — coarse (model resolution)`,
      };
    }
  }

  if (metar.tempC != null && metar.dewpC != null) {
    const spread = metar.tempC - metar.dewpC;
    const m = estimatedCloudBaseM(metar.tempC, metar.dewpC);
    const baseFt = Math.round(mToFt(m));
    const baseM = Math.round(m);

    // Spread-based reasoning is unreliable through an inversion / when the spread widens aloft.
    const unreliable =
      profile != null &&
      (detectInversion(profile.levels) != null || spreadWidensWithHeight(profile.levels));
    const invNote = unreliable
      ? ' Temperature inversion / stable layer aloft — treat the spread-based base as unreliable.'
      : '';

    // Model low-cloud context (the model tier above only fires at ≥ 50 %; here it didn't).
    const lowCloud =
      profile?.source === 'model'
        ? profile.levels
            .filter((l) => l.altM <= LOW_CLOUD_CAP_M && l.cloudPct != null)
            .map((l) => l.cloudPct as number)
        : [];
    const modelLowMaxPct = lowCloud.length ? Math.max(...lowCloud) : null;

    // Gate false precision: a dry/large spread with no model or observed low cloud means clear
    // sky or a high base — don't present a precise multi-km number. A near-saturated surface keeps
    // the (low, meaningful) estimate.
    const surfaceNearSat = spread <= NEAR_SAT_SPREAD_C;
    const gate =
      !surfaceNearSat &&
      (m >= HIGH_BASE_M ||
        (modelLowMaxPct != null && modelLowMaxPct < WEAK_LOW_CLOUD_PCT && spread >= DRY_SPREAD_C));

    if (gate) {
      return {
        kind: 'none-low',
        baseFt,
        baseM,
        note: `No significant low cloud expected — clear sky or a high base (rough spread estimate ≈ ${baseM} m).${invNote}`,
        unreliable,
      };
    }

    return {
      kind: 'estimate',
      baseFt,
      baseM,
      note: `Estimated from dew point spread (≈125 m × (T − Td)) — approximate.${invNote}`,
      unreliable,
    };
  }

  return { kind: 'none', baseFt: null, baseM: null, note: 'No cloud information available' };
}
