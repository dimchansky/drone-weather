// Environmental saturation helpers. These answer "where is the AMBIENT air already near
// saturated?" — distinct from the parcel LCL (clouds.estimatedCloudBaseM), which is where a
// LIFTED surface parcel would saturate. For a drone climbing through still air the environmental
// quantity is what wets it. See docs/cloud-base-research.md §1 for the distinction and §3 for the
// evidence that the coarse model under-detects shallow low layers (so this is a supplement, not a
// replacement, for the surface signal).

import type { ProfileLevel } from './types';

const spreadOf = (l: ProfileLevel): number | null => (l.dewpC == null ? null : l.tempC - l.dewpC);

export interface EnvSaturationOpts {
  /** °C; spread at or below this counts as near-saturated. */
  spreadThresh?: number;
  /** %; RH at or above this counts as near-saturated. */
  rhThresh?: number;
  /** Ignore levels above this height (m AGL). */
  capM?: number;
  /** Ignore levels below this height (m AGL) — e.g. to look only ABOVE the surface band. */
  minM?: number;
}

/**
 * Lowest height (m AGL) within [minM, capM] where ambient air is near-saturated, interpolating
 * the spread between bracketing levels. Scans levels in order with NO monotonic assumption, so it
 * survives inversions (a level can re-saturate above a dry layer). Returns null if none qualify.
 * `levels` is expected sorted ascending by altM (the profile always is).
 */
export function envSaturationHeightM(
  levels: ProfileLevel[],
  opts: EnvSaturationOpts = {},
): number | null {
  const spreadThresh = opts.spreadThresh ?? 1.0;
  const rhThresh = opts.rhThresh ?? 95;
  const capM = opts.capM ?? 3000;
  const minM = opts.minM ?? 0;
  const near = (l: ProfileLevel): boolean => {
    const s = spreadOf(l);
    return (s != null && s <= spreadThresh) || (l.rhPct != null && l.rhPct >= rhThresh);
  };

  const inRange = levels.filter((l) => l.altM >= minM && l.altM <= capM);
  for (let k = 0; k < inRange.length; k++) {
    if (!near(inRange[k])) continue;
    if (k === 0) return Math.round(inRange[0].altM);
    const lo = inRange[k - 1];
    const hi = inRange[k];
    const sLo = spreadOf(lo);
    const sHi = spreadOf(hi);
    let m = hi.altM;
    // Interpolate only when the level qualifies BY the spread threshold (not when it qualifies by
    // RH while the spread is still wide — extrapolating the spread there is meaningless).
    if (sLo != null && sHi != null && sHi <= spreadThresh && sLo > spreadThresh && sLo !== sHi) {
      const t = (sLo - spreadThresh) / (sLo - sHi); // fraction toward hi where spread == thresh
      m = lo.altM + t * (hi.altM - lo.altM);
    }
    return Math.round(m);
  }
  return null;
}

/**
 * Diagnostic (honesty signal, NOT an estimator): does the low-level environmental spread fail to
 * close with height — i.e. Γ_T − Γ_Td ≤ 0? When true, a lifted-parcel cloud base (125 × spread)
 * is physically misleading (the air aloft is drying or warming faster than it moistens). Returns
 * false when it cannot be computed (no model dew points), so the offline fallback stays unflagged.
 */
export function spreadWidensWithHeight(levels: ProfileLevel[]): boolean {
  if (levels.length < 2) return false;
  const sfc = levels[0];
  if (sfc.dewpC == null) return false;
  const above = levels.find((l) => l.altM >= 50 && l.dewpC != null);
  if (!above || above === sfc || above.dewpC == null) return false;
  const dz = above.altM - sfc.altM;
  if (dz <= 0) return false;
  const gammaT = (sfc.tempC - above.tempC) / dz; // °C/m, positive = cooling with height
  const gammaTd = (sfc.dewpC - above.dewpC) / dz;
  return gammaT - gammaTd <= 0; // spread not closing → cloud-base-by-lifting unreliable
}
