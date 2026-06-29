// Cloud-base / wet-layer research harness. Reuses the REAL app domain code against the
// committed fixtures (research/cloud-base/fixtures), runs candidate methods A–E, and prints
// comparison tables + summary stats. Deterministic against the fixtures.
//
// Skipped in the normal suite (like src/data/__tests__/live.test.ts). Run explicitly:
//   RESEARCH=1 npx vitest run research/cloud-base/cloudBase.research.test.ts
//
// NOT production code. Findings are written up in docs/cloud-base-research.md.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { parseMetar, hasFog, hasMist, hasPrecip, hasFreezingFog } from '../../src/domain/metar';
import { resolveCloudBase, ceilingFt, estimatedCloudBaseM } from '../../src/domain/clouds';
import { mergeModelProfile, detectInversion } from '../../src/domain/profile';
import { parseProfile } from '../../src/data/openMeteo';
import { ftToM } from '../../src/domain/units';
import {
  buildLevels,
  envSaturationHeight,
  profileAwareLCL,
  modelCloudBase,
  type Lvl,
} from './methods';

const RESEARCH = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.RESEARCH;

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = join(HERE, 'fixtures');

const RICH_HPA = [1000, 975, 950, 925, 900, 850, 800, 700];
const APP_HPA = [1000, 950, 925, 900, 850];
const DRONE_BAND_M = 120; // default ops ceiling

type AnyRec = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const pad = (s: string | number, w: number) => String(s).padEnd(w);
const padL = (s: string | number, w: number) => String(s).padStart(w);
const mShow = (m: number | null) => (m == null ? '—' : `${Math.round(m)}`);

function nearestIdx(times: string[], t: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(`${times[i]}Z`).getTime() - t);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

interface Row {
  icao: string;
  label: string;
  tC: number | null;
  tdC: number | null;
  spread: number | null;
  metarLowM: number | null; // lowest reported layer (any cover)
  metarLowFt: number | null;
  ceilFt: number | null; // lowest BKN/OVC/VV
  cavok: boolean;
  wx: string;
  visM: number | null;
  A: number; // Espy
  Bapp: number | null;
  Brich: number | null;
  BrichSfc: boolean;
  C: ReturnType<typeof profileAwareLCL>;
  D: number | null;
  Eapp: string; // app resolveCloudBase kind:base
  EappM: number | null;
  inv: { topM: number; deltaC: number } | null;
  wetTruth: boolean; // METAR says wet air in the 0–120 m band
  lowWetTruth: boolean; // METAR says a low wet layer ≤500 m (drone-relevant proximity)
}

function analyze(): Row[] {
  const files = readdirSync(FIX_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  const rows: Row[] = [];

  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(FIX_DIR, f), 'utf8')) as AnyRec;
    const mj = fx.metar as AnyRec;
    const om = fx.om as AnyRec;
    if (!mj?.rawOb || !om?.hourly) continue;

    const obsMs = (num(mj.obsTime) ?? 0) * 1000;
    const now = new Date(obsMs);
    const metar = parseMetar(mj.rawOb as string, {
      now,
      icao: mj.icaoId as string,
      station: { lat: num(mj.lat) ?? 0, lon: num(mj.lon) ?? 0 },
      elevationM: num(mj.elev) ?? 0,
    });
    metar.observedAt = now;

    const hourly = om.hourly as Record<string, (number | null)[]>;
    const times = hourly.time as unknown as string[];
    const i = nearestIdx(times, obsMs);
    const elev = num(om.elevation) ?? 0;

    const richLevels = buildLevels(hourly, i, elev, RICH_HPA);
    const appLevels = buildLevels(hourly, i, elev, APP_HPA);

    // Surface T/Td for Espy: METAR first, else model surface.
    const tC = metar.tempC ?? num((hourly.temperature_2m as number[])?.[i]);
    const tdC = metar.dewpC ?? num((hourly.dew_point_2m as number[])?.[i]);
    const spread = tC != null && tdC != null ? tC - tdC : null;

    const A = tC != null && tdC != null ? estimatedCloudBaseM(tC, tdC) : NaN;
    const Bapp = envSaturationHeight(appLevels);
    const Brich = envSaturationHeight(richLevels);
    const C = profileAwareLCL(richLevels);
    const D = modelCloudBase(richLevels, { coverThresh: 50 });

    // App's actual resolveCloudBase (E) — exact production path.
    let Eapp = 'n/a';
    let EappM: number | null = null;
    const appProfileLevels = parseProfile(om, now);
    if (appProfileLevels.length >= 2) {
      const vp = mergeModelProfile(appProfileLevels);
      const r = resolveCloudBase(metar, vp);
      Eapp = `${r.kind}:${mShow(r.baseM)}`;
      EappM = r.baseM;
    } else {
      const r = resolveCloudBase(metar);
      Eapp = `${r.kind}:${mShow(r.baseM)}`;
      EappM = r.baseM;
    }

    // METAR truth.
    const based = metar.clouds.filter((c) => c.baseFt != null);
    const metarLowFt = based.length ? Math.min(...based.map((c) => c.baseFt as number)) : null;
    const metarLowM = metarLowFt == null ? null : Math.round(ftToM(metarLowFt));
    const ceil = ceilingFt(metar.clouds);
    const wx = metar.weather.map((w) => w.raw).join(' ') || (metar.cavok ? 'CAVOK' : '');

    const inv = detectInversion(richLevels.map((l) => ({ altM: l.altM, tempC: l.tempC })));

    // Drone-band wet truth: fog/freezing fog, OR a reported layer base ≤120 m, OR precip,
    // OR (mist with low visibility). Conservative: what would actually wet the airframe ≤120 m.
    const wetTruth =
      hasFog(metar) ||
      hasFreezingFog(metar) ||
      hasPrecip(metar) ||
      (metarLowM != null && metarLowM <= DRONE_BAND_M) ||
      (hasMist(metar) && (metar.visibilityM ?? 9999) < 3000);

    const lowWetTruth =
      hasFog(metar) ||
      hasFreezingFog(metar) ||
      hasPrecip(metar) ||
      (metarLowM != null && metarLowM <= 500) ||
      (hasMist(metar) && (metar.visibilityM ?? 9999) < 5000);

    rows.push({
      icao: metar.icao,
      label: (fx.label as string) ?? '',
      tC,
      tdC,
      spread,
      metarLowM,
      metarLowFt,
      ceilFt: ceil,
      cavok: metar.cavok,
      wx,
      visM: metar.visibilityM,
      A,
      Bapp: Bapp.saturatedSurface ? 0 : Bapp.m,
      Brich: Brich.saturatedSurface ? 0 : Brich.m,
      BrichSfc: Brich.saturatedSurface,
      C,
      D,
      Eapp,
      EappM,
      inv,
      wetTruth,
      lowWetTruth,
    });
  }
  return rows;
}

describe.skipIf(!RESEARCH)('cloud-base research', () => {
  it('compares methods A–E against METAR across the fixture sample', () => {
    const rows = analyze();
    expect(rows.length).toBeGreaterThan(0);

    const L: string[] = [];
    L.push('');
    L.push('='.repeat(132));
    L.push('CLOUD-BASE / WET-LAYER METHOD COMPARISON  (heights in m AGL unless noted)');
    L.push(
      'A=Espy 125×spread (parcel LCL) · Bapp/Brich=env saturation (app vs +975hPa levels) · ' +
        'D=model cloud≥50% · E=app resolveCloudBase',
    );
    L.push('='.repeat(132));
    L.push(
      pad('ICAO', 6) +
        pad('T/Td/spr', 13) +
        pad('METARlow', 14) +
        pad('ceil', 7) +
        pad('A', 7) +
        pad('Bapp', 7) +
        pad('Brich', 7) +
        pad('D', 7) +
        pad('E(app)', 16) +
        pad('wx/notes', 30),
    );
    L.push('-'.repeat(132));
    for (const r of rows) {
      const tt =
        r.tC == null ? '—' : `${r.tC}/${r.tdC ?? '—'}/${r.spread == null ? '—' : r.spread.toFixed(0)}`;
      const ml = r.cavok ? 'CAVOK' : r.metarLowFt == null ? (r.wx.includes('NCD') ? 'NCD' : 'clear') : `${r.metarLowFt}ft/${r.metarLowM}m`;
      const note = [
        r.inv ? `inv+${r.inv.deltaC.toFixed(1)}@${r.inv.topM}m` : '',
        r.wetTruth ? 'WET≤120' : '',
        r.wx.replace('CAVOK', ''),
      ]
        .filter(Boolean)
        .join(' ');
      L.push(
        pad(r.icao, 6) +
          pad(tt, 13) +
          pad(ml, 14) +
          pad(r.ceilFt == null ? '—' : `${r.ceilFt}`, 7) +
          pad(Number.isNaN(r.A) ? '—' : Math.round(r.A), 7) +
          pad(mShow(r.Bapp), 7) +
          pad(r.BrichSfc ? '0(sfc)' : mShow(r.Brich), 7) +
          pad(mShow(r.D), 7) +
          pad(r.Eapp, 16) +
          pad(note, 30),
      );
    }

    // ---- Cloud-base accuracy vs METAR lowest reported layer (only where measurable) ----
    const measurable = rows.filter((r) => r.metarLowM != null && !r.cavok);
    const errStats = (get: (r: Row) => number | null) => {
      const errs: number[] = [];
      for (const r of measurable) {
        const v = get(r);
        if (v != null && Number.isFinite(v)) errs.push(v - (r.metarLowM as number));
      }
      const n = errs.length;
      const mae = n ? errs.reduce((s, e) => s + Math.abs(e), 0) / n : NaN;
      const bias = n ? errs.reduce((s, e) => s + e, 0) / n : NaN;
      return { n, mae, bias };
    };
    L.push('');
    L.push('='.repeat(80));
    L.push(`CLOUD-BASE ERROR vs METAR lowest layer  (n=${measurable.length} measurable stations)`);
    L.push('='.repeat(80));
    L.push(pad('method', 28) + pad('n', 5) + pad('MAE(m)', 10) + pad('bias(m)', 10));
    const report = (name: string, get: (r: Row) => number | null) => {
      const s = errStats(get);
      L.push(pad(name, 28) + pad(s.n, 5) + pad(Number.isNaN(s.mae) ? '—' : s.mae.toFixed(0), 10) + pad(Number.isNaN(s.bias) ? '—' : s.bias.toFixed(0), 10));
    };
    report('A  Espy 125×spread', (r) => (Number.isNaN(r.A) ? null : r.A));
    report('B  env-sat (app levels)', (r) => r.Bapp);
    report('B  env-sat (+975 levels)', (r) => r.Brich);
    report('D  model cloud≥50%', (r) => r.D);
    report('E  app resolveCloudBase', (r) => r.EappM);

    // ---- Ceiling subset (BKN/OVC) — the safety-relevant "in-cloud" cases ----
    const ceilRows = measurable.filter((r) => r.ceilFt != null);
    L.push('');
    L.push(`CEILING SUBSET (BKN/OVC present, n=${ceilRows.length}) — same MAE, restricted:`);
    const ceilErr = (get: (r: Row) => number | null) => {
      const e: number[] = [];
      for (const r of ceilRows) {
        const v = get(r);
        const truth = ftToM(r.ceilFt as number);
        if (v != null && Number.isFinite(v)) e.push(v - truth);
      }
      const mae = e.length ? e.reduce((s, x) => s + Math.abs(x), 0) / e.length : NaN;
      return e.length ? `MAE ${mae.toFixed(0)} m (n=${e.length})` : '—';
    };
    L.push(`  A  Espy:            ${ceilErr((r) => (Number.isNaN(r.A) ? null : r.A))}`);
    L.push(`  B  env-sat(+975):   ${ceilErr((r) => r.Brich)}`);
    L.push(`  D  model cloud≥50%: ${ceilErr((r) => r.D)}`);
    L.push(`  E  app:             ${ceilErr((r) => r.EappM)}`);

    // ---- Drone-band wetness detection (the real objective) ----
    const detect = (name: string, pred: (r: Row) => boolean) => {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (const r of rows) {
        const p = pred(r);
        if (r.wetTruth && p) tp++;
        else if (r.wetTruth && !p) fn++;
        else if (!r.wetTruth && p) fp++;
        else tn++;
      }
      L.push(
        pad(name, 30) + pad(`TP ${tp}`, 7) + pad(`FN ${fn}`, 7) + pad(`FP ${fp}`, 7) + pad(`TN ${tn}`, 7),
      );
    };
    L.push('');
    L.push('='.repeat(80));
    L.push('DRONE-BAND (≤120 m) WET-AIR DETECTION vs METAR truth  (TP/FN want↑/↓, FP=false alarm)');
    L.push('='.repeat(80));
    const wetCount = rows.filter((r) => r.wetTruth).length;
    L.push(`truth: ${wetCount}/${rows.length} stations have wet air in the 0–120 m band`);
    detect('A  Espy ≤120 m', (r) => !Number.isNaN(r.A) && r.A <= DRONE_BAND_M);
    detect('B  env-sat(+975) ≤120 m', (r) => r.Brich != null && r.Brich <= DRONE_BAND_M);
    detect('D  model cloud≥50% ≤150 m', (r) => r.D != null && r.D <= 150);
    detect('A or B (≤120 m, combined)', (r) => (!Number.isNaN(r.A) && r.A <= DRONE_BAND_M) || (r.Brich != null && r.Brich <= DRONE_BAND_M));

    // Second band: a LOW wet layer within ~500 m (proximity matters even above the ops band).
    const detectLow = (name: string, pred: (r: Row) => boolean) => {
      let tp = 0;
      let fn = 0;
      let fp = 0;
      let tn = 0;
      for (const r of rows) {
        const p = pred(r);
        if (r.lowWetTruth && p) tp++;
        else if (r.lowWetTruth && !p) fn++;
        else if (!r.lowWetTruth && p) fp++;
        else tn++;
      }
      L.push(pad(name, 30) + pad(`TP ${tp}`, 7) + pad(`FN ${fn}`, 7) + pad(`FP ${fp}`, 7) + pad(`TN ${tn}`, 7));
    };
    L.push('');
    const lowCount = rows.filter((r) => r.lowWetTruth).length;
    L.push(`LOW WET LAYER ≤500 m detection  (truth: ${lowCount}/${rows.length} stations):`);
    detectLow('A  Espy ≤500 m', (r) => !Number.isNaN(r.A) && r.A <= 500);
    detectLow('B  env-sat(+975) ≤500 m', (r) => r.Brich != null && r.Brich <= 500);
    detectLow('D  model cloud≥50% ≤500 m', (r) => r.D != null && r.D <= 500);
    detectLow('A and METAR not CAVOK/clear', (r) => !Number.isNaN(r.A) && r.A <= 500 && r.metarLowM != null);

    // ---- Inversion / divergence highlights ----
    L.push('');
    L.push('='.repeat(80));
    L.push('INVERSION & A↔B DIVERGENCE (where the classic formula is most suspect)');
    L.push('='.repeat(80));
    for (const r of rows) {
      const aVal = Number.isNaN(r.A) ? null : Math.round(r.A);
      const diverge = aVal != null && r.Brich != null && Math.abs(aVal - r.Brich) >= 300;
      if (r.inv || diverge || !r.C.valid) {
        L.push(
          pad(r.icao, 6) +
            pad(r.inv ? `inv +${r.inv.deltaC.toFixed(1)}°C@${r.inv.topM}m` : 'no-inv', 20) +
            pad(`A=${aVal ?? '—'}`, 9) +
            pad(`Brich=${mShow(r.Brich)}`, 13) +
            pad(`C:${r.C.valid ? `${r.C.m}m(${r.C.coeffMPerC}m/°C)` : 'invalid'}`, 22) +
            pad(r.C.note, 50),
        );
      }
    }
    L.push('');

    const out = L.join('\n');
    // eslint-disable-next-line no-console
    console.log(out);
    writeFileSync(join(HERE, 'RESULTS.txt'), out + '\n');
  });
});
