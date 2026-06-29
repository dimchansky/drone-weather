// Candidate cloud-base / wet-layer estimators, isolated as pure functions so the research
// harness (cloudBase.research.test.ts) and the eventual production port share one definition.
// Reuses the app's Magnus dew-point so the model-level dew points match the app exactly.
//
// Terminology kept deliberately distinct (see docs/cloud-base-research.md):
//   - PARCEL LCL (method A / Espy): where a surface parcel lifted dry-adiabatically saturates.
//   - ENVIRONMENTAL saturation height (method B): lowest height where the AMBIENT air is
//     already near-saturated. This is what wets a drone climbing through still air.
//   - MODEL cloud layer (method D): lowest model pressure level reporting significant cloud.

import { dewPointFromRH } from '../../src/domain/humidity';

export interface Lvl {
  altM: number; // AGL
  tempC: number;
  dewpC: number | null;
  rhPct: number | null;
  cloudPct: number | null;
}

/** Build AGL model levels from an Open-Meteo hourly record at index `i`, for the given hPa set. */
export function buildLevels(
  hourly: Record<string, (number | null)[]>,
  i: number,
  elevationM: number,
  levelsHpa: number[],
): Lvl[] {
  const at = (k: string): number | null => {
    const a = hourly[k];
    return a && a[i] != null ? (a[i] as number) : null;
  };
  const out: Lvl[] = [];

  const t2 = at('temperature_2m');
  if (t2 != null) {
    const rh = at('relative_humidity_2m');
    const td2 = at('dew_point_2m');
    out.push({
      altM: 0,
      tempC: t2,
      dewpC: td2 ?? (rh != null ? dewPointFromRH(t2, rh) : null),
      rhPct: rh,
      // Surface "low cloud cover" is a column proxy, not a height — only used as a 0 m hint.
      cloudPct: at('cloud_cover_low'),
    });
  }

  for (const l of levelsHpa) {
    const geo = at(`geopotential_height_${l}hPa`);
    const t = at(`temperature_${l}hPa`);
    if (geo == null || t == null) continue;
    const altM = geo - elevationM;
    if (altM <= 0) continue;
    const rh = at(`relative_humidity_${l}hPa`);
    out.push({
      altM,
      tempC: t,
      dewpC: rh != null ? dewPointFromRH(t, rh) : null,
      rhPct: rh,
      cloudPct: at(`cloud_cover_${l}hPa`),
    });
  }
  return out.sort((a, b) => a.altM - b.altM);
}

const spreadOf = (l: Lvl): number | null => (l.dewpC == null ? null : l.tempC - l.dewpC);

/** Method A — Espy parcel-LCL fallback: 125 m per °C of surface spread. */
export function espyLCL(tempC: number, dewpC: number): number {
  return Math.max(0, 125 * (tempC - dewpC));
}

export interface SatResult {
  m: number | null; // height AGL of first near-saturation, or null if none below cap
  saturatedSurface: boolean; // surface itself already near-saturated (fog/in-cloud)
}

/**
 * Method B — environmental saturation height. Lowest AGL height where ambient air is
 * near-saturated (spread ≤ spreadThresh OR RH ≥ rhThresh), with linear interpolation of the
 * spread between bracketing model levels. Scans ALL levels (no monotonic assumption), so it
 * handles inversions: a level can re-saturate above a dry layer.
 */
export function envSaturationHeight(
  levels: Lvl[],
  opts: { spreadThresh?: number; rhThresh?: number; capM?: number } = {},
): SatResult {
  const spreadThresh = opts.spreadThresh ?? 1.0;
  const rhThresh = opts.rhThresh ?? 95;
  const capM = opts.capM ?? 3000;
  const near = (l: Lvl): boolean => {
    const s = spreadOf(l);
    return (s != null && s <= spreadThresh) || (l.rhPct != null && l.rhPct >= rhThresh);
  };

  if (levels.length && near(levels[0])) return { m: 0, saturatedSurface: true };

  for (let k = 1; k < levels.length; k++) {
    if (levels[k].altM > capM) break;
    if (near(levels[k])) {
      // Interpolate where spread crosses the threshold between k-1 and k (if spreads known).
      const lo = levels[k - 1];
      const hi = levels[k];
      const sLo = spreadOf(lo);
      const sHi = spreadOf(hi);
      let m = hi.altM;
      if (sLo != null && sHi != null && sLo > spreadThresh && sLo !== sHi) {
        const t = (sLo - spreadThresh) / (sLo - sHi); // fraction toward hi where spread==thresh
        m = lo.altM + t * (hi.altM - lo.altM);
      }
      return { m: Math.round(m), saturatedSurface: false };
    }
  }
  return { m: null, saturatedSurface: false };
}

export interface ProfileLclResult {
  m: number | null;
  coeffMPerC: number | null; // implied m/°C (compare against Espy's 125)
  valid: boolean; // false when the environment's spread is not closing with height
  note: string;
}

/**
 * Method C — profile-aware "environmental" saturation via local low-level gradients.
 * z = spread0 / (Γ_T − Γ_Td) using the model's actual T and Td gradients over the lowest layer.
 * If Γ_T − Γ_Td ≤ 0 (inversion / spread widening), the lifted-environment idea has no solution —
 * we report invalid rather than a bogus number. This is the diagnostic that flags when method A
 * is physically misleading.
 */
export function profileAwareLCL(levels: Lvl[]): ProfileLclResult {
  const sfc = levels[0];
  // First level meaningfully above the surface (≥ 50 m) to estimate a gradient.
  const above = levels.find((l) => l.altM >= 50);
  if (!sfc || !above || above === sfc || sfc.dewpC == null || above.dewpC == null) {
    return { m: null, coeffMPerC: null, valid: false, note: 'insufficient levels' };
  }
  const dz = above.altM - sfc.altM;
  const gammaT = (sfc.tempC - above.tempC) / dz; // °C per m (positive = cooling with height)
  const gammaTd = (sfc.dewpC - above.dewpC) / dz;
  const closing = gammaT - gammaTd; // °C per m at which spread closes
  const spread0 = sfc.tempC - sfc.dewpC;
  if (closing <= 1e-6) {
    return {
      m: null,
      coeffMPerC: null,
      valid: false,
      note: 'spread not closing with height (inversion/stable) — lifted-parcel LCL is misleading',
    };
  }
  return {
    m: Math.round(spread0 / closing),
    coeffMPerC: Math.round(1 / closing),
    valid: true,
    note: 'environmental spread closes with height',
  };
}

/** Method D — model cloud-cover profile: lowest level with cover ≥ thresh (optionally RH-gated). */
export function modelCloudBase(
  levels: Lvl[],
  opts: { coverThresh?: number; rhThresh?: number; capM?: number } = {},
): number | null {
  const coverThresh = opts.coverThresh ?? 50;
  const rhThresh = opts.rhThresh ?? 0;
  const capM = opts.capM ?? 6000;
  for (const l of levels) {
    if (l.altM > capM) break;
    if (l.cloudPct != null && l.cloudPct >= coverThresh && (l.rhPct ?? 100) >= rhThresh) {
      return Math.round(l.altM);
    }
  }
  return null;
}
