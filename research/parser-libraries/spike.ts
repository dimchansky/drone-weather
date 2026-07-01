/*
 * Spike: compare `metar-taf-parser` (aeharding) against our in-house parser on the tricky
 * examples the app must handle. Research only — NOT wired into the app. Run: `npm run spike`.
 *
 * It parses each example with BOTH parsers, normalizes the library output toward our domain
 * shape, and prints a side-by-side so we can judge field coverage, unit handling, and robustness
 * (does the library throw where ours degrades?). Also probes malformed/edge inputs for throws.
 */
import {
  parseMetar as libParseMetar,
  parseTAF as libParseTAF,
  CloudType,
  type IMetar,
  type ITAF,
  type IWind,
  type Visibility,
  type ICloud,
  type IWeatherCondition,
} from 'metar-taf-parser';

// Our parser (pure TS; tsx resolves the extensionless intra-domain imports).
import { parseMetar as ourParseMetar } from '../../src/domain/metar.ts';
import { parseTaf as ourParseTaf } from '../../src/domain/taf.ts';

const REF = new Date('2026-07-01T12:00:00Z');

const METARS: [string, string][] = [
  ['plain SM+altimeter', 'KMCI 011253Z 19017KT 10SM 26/22 A2971'],
  ['CAVOK', 'EYVI 011200Z 22010KT CAVOK 20/09 Q1019'],
  ['SCT/BKN/OVC', 'EGLL 011220Z 24012KT 9999 SCT038 BKN050 OVC070 12/06 Q1015'],
  ['CB', 'LSZH 011220Z 20004KT 150V280 9999 FEW035 FEW040CB 23/14 Q1022'],
  ['TCU', 'SBCH 011500Z 09006KT 8000 FEW006 BKN030 FEW040TCU BKN070 19/19 Q1017'],
  ['TSRA (heavy)', 'KMCI 011253Z 18015G25KT 3SM +TSRA BKN008CB 22/21 A2985'],
  ['freezing precip', 'CYYZ 011200Z 09012KT 1/2SM FZRA BR VV004 M01/M02 A2980'],
  ['fog/mist', 'EGLL 010350Z 00000KT 0300 FG SCT001 08/08 Q1020'],
  ['variable wind + gust', 'EHAM 011225Z VRB03G18KT 6000 -RA SCT012 14/12 Q1008'],
  ['low vis (m) + NDV', 'EDDF 011220Z 04008KT 1200NDV BR OVC002 05/05 Q1013'],
  ['MPS wind', 'UUEE 011230Z 27006MPS 9999 BKN020 15/10 Q1009'],
  ['auto ///markers', 'ESSA 011220Z AUTO 30015G27KT 9999 BKN014/// //////CB 08/05 Q0998'],
];

const TAFS: [string, string][] = [
  ['FM', 'TAF EDDB 010800Z 0109/0209 24008KT 9999 SCT035 FM011400 27015G25KT 9999 BKN030'],
  ['BECMG', 'TAF EHAM 010500Z 0106/0212 21010KT 9999 SCT030 BECMG 0108/0110 24016G28KT'],
  ['TEMPO + TSRA + CB', 'TAF VVTS 010500Z 0106/0212 28012KT 9999 FEW020 TEMPO 0108/0110 TSRA BKN015CB'],
  ['PROB30 TEMPO', 'TAF KMCI 011130Z 0112/0212 18010KT P6SM SCT040 PROB30 TEMPO 0118/0122 TSRA BKN025CB'],
  ['WS + TX/TN (our warnings)', 'TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT TX35/0122Z TNM01/0210Z'],
  ['multi-hazard', 'TAF EYVI 011000Z 0112/0212 22010KT 9999 SCT030 TEMPO 0112/0121 TSRA BKN020CB TEMPO 0120/0203 0800 BKN002 TEMPO 0112/0203 3000 BR'],
];

// ---- normalizers (library shape -> our concepts) ----
const q = (n: unknown) => (n == null ? '·' : String(n));

function libWind(w?: IWind): string {
  if (!w) return 'none';
  const dir = w.degrees == null ? 'VRB' : `${w.degrees}°`;
  const vari = w.minVariation != null ? ` var ${w.minVariation}/${w.maxVariation}` : '';
  const gust = w.gust != null ? `G${w.gust}` : '';
  return `${dir} ${w.speed}${gust}${w.unit}${vari}`;
}
function libVis(v?: Visibility): string {
  if (!v) return '·';
  return `${v.indicator ?? ''}${v.value}${v.unit}${v.ndv ? ' NDV' : ''}`;
}
function libCloud(c: ICloud): string {
  const t = c.type ? `/${c.type}` : '';
  const t2 = c.secondaryType ? `+${c.secondaryType}` : '';
  return `${c.quantity}${c.height ?? '···'}${t}${t2}`;
}
function libWx(w: IWeatherCondition): string {
  return `${w.intensity ?? ''}${w.descriptive ?? ''}${w.phenomenons.join('')}`;
}
const libClouds = (m: { clouds: ICloud[]; verticalVisibility?: number }) =>
  `[${m.clouds.map(libCloud).join(' ')}]${m.verticalVisibility != null ? ` VV${m.verticalVisibility}` : ''}`;

function showLibMetar(m: IMetar): string {
  return [
    `station=${q(m.station)}`,
    `wind=${libWind(m.wind)}`,
    `vis=${libVis(m.visibility)}`,
    `cavok=${m.cavok ? 'Y' : '·'}`,
    `wx=[${m.weatherConditions.map(libWx).join(',')}]`,
    `clouds=${libClouds(m)}`,
    `T/Td=${q(m.temperature)}/${q(m.dewPoint)}`,
    `alt=${m.altimeter ? m.altimeter.value + m.altimeter.unit : '·'}`,
    `flags=${[m.auto && 'auto', m.corrected && 'cor', m.nosig && 'nosig'].filter(Boolean).join(',') || '·'}`,
    `cbCloud=${m.clouds.some((c) => c.type === CloudType.CB || c.secondaryType === CloudType.CB) ? 'Y' : '·'}`,
  ].join(' ');
}

function ourMetarView(raw: string): string {
  const m = ourParseMetar(raw, { now: REF });
  const w = m.wind;
  const wind = `${w.variable ? 'VRB' : w.dirDeg + '°'} ${w.speedKt}${w.gustKt ? 'G' + w.gustKt : ''}kt${w.varFromDeg != null ? ` var ${w.varFromDeg}/${w.varToDeg}` : ''}`;
  const clouds = `[${m.clouds.map((c) => `${c.cover}${c.baseFt ?? '···'}${c.cb ? '/CB' : c.tcu ? '/TCU' : ''}`).join(' ')}]`;
  return [
    `icao=${m.icao}`,
    `wind=${wind}`,
    `visM=${q(m.visibilityM)}`,
    `cavok=${m.cavok ? 'Y' : '·'}`,
    `wx=[${m.weather.map((x) => `${x.intensity}${x.descriptor ?? ''}${x.phenomena.join('')}`).join(',')}]`,
    `clouds=${clouds}`,
    `T/Td=${q(m.tempC)}/${q(m.dewpC)}`,
    `qnhHpa=${q(m.qnhHpa)}`,
  ].join(' ');
}

function tryLib<T>(fn: () => T): { ok: true; value: T } | { ok: false; err: string } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, err: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

console.log('\n========== METAR ==========\n');
for (const [label, raw] of METARS) {
  console.log(`### ${label}\n    ${raw}`);
  console.log(`  ours: ${ourMetarView(raw)}`);
  const r = tryLib(() => libParseMetar(raw));
  if (r.ok) console.log(`  lib : ${showLibMetar(r.value)}`);
  else console.log(`  lib : ⚠️ THREW ${r.err}`);
  console.log('');
}

console.log('\n========== TAF ==========\n');
for (const [label, raw] of TAFS) {
  console.log(`### ${label}\n    ${raw}`);
  const ours = ourParseTaf(raw, { reference: REF });
  console.log(
    `  ours periods (${ours.periods.length}), warnings=[${ours.warnings.join(' ')}]:`,
  );
  for (const p of ours.periods) {
    const wind = p.wind ? `${p.wind.variable ? 'VRB' : p.wind.dirDeg + '°'} ${p.wind.speedKt}${p.wind.gustKt ? 'G' + p.wind.gustKt : ''}kt` : '·';
    console.log(
      `     [${p.changeType}${p.probPct ? p.probPct : ''}${p.tempo ? '·tempo' : ''}] ${p.from ? p.from.toISOString().slice(5, 16) : '·'}→${p.to ? p.to.toISOString().slice(5, 16) : '·'} wind=${wind} visM=${q(p.visibilityM)} wx=[${p.weather.map((x) => x.raw).join(',')}] clouds=[${p.clouds.map((c) => c.cover + (c.baseFt ?? '') + (c.cb ? 'CB' : '')).join(' ')}]`,
    );
  }
  const r = tryLib(() => libParseTAF(raw, { issued: REF }));
  if (!r.ok) {
    console.log(`  lib : ⚠️ THREW ${r.err}\n`);
    continue;
  }
  const t = r.value as ITAF;
  console.log(`  lib base: wind=${libWind(t.wind)} vis=${libVis(t.visibility)} clouds=${libClouds(t)} wx=[${t.weatherConditions.map(libWx).join(',')}] validity=${t.validity.startDay}/${t.validity.startHour}→${t.validity.endDay}/${t.validity.endHour}`);
  console.log(`  lib maxT/minT=${t.maxTemperature ? t.maxTemperature.temperature : '·'}/${t.minTemperature ? t.minTemperature.temperature : '·'} icing=${(t.icing?.length ?? 0)} turb=${(t.turbulence?.length ?? 0)} windShear(base)=${t.windShear ? 'Y' : '·'}`);
  for (const tr of t.trends) {
    const v: any = tr.validity;
    const val = v.startMinutes != null ? `FM ${v.startDay}/${v.startHour}:${v.startMinutes}` : `${v.startDay}/${v.startHour}→${v.endDay}/${v.endHour}`;
    console.log(`     [${tr.type}${tr.probability != null ? ' PROB' + tr.probability : ''}] ${val} wind=${libWind(tr.wind)} vis=${libVis(tr.visibility)} clouds=${libClouds(tr)} wx=[${tr.weatherConditions.map(libWx).join(',')}] ws=${tr.windShear ? 'Y' : '·'} raw="${tr.raw}"`);
  }
  console.log('');
}

console.log('\n========== ROBUSTNESS (does it throw where we degrade?) ==========\n');
const EDGE: [string, 'metar' | 'taf'][] = [
  ['KMCI 011253Z 19017KT 10SM 26/22 A2971 RERA WSHFT 1245', 'metar'], // trailing recognized-but-odd
  ['GARBAGE not a metar at all', 'metar'],
  ['EGLL 011220Z 24012KT 9999 SCT038 QQQ999 12/06 Q1015', 'metar'], // junk token mid-body
  ['TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035 FOOBAR 123', 'taf'], // junk in TAF
  ['', 'metar'], // empty
  ['METAR', 'metar'], // header only
];
for (const [raw, kind] of EDGE) {
  const r = kind === 'metar' ? tryLib(() => libParseMetar(raw)) : tryLib(() => libParseTAF(raw, { issued: REF }));
  const ours =
    kind === 'metar'
      ? tryLib(() => ourParseMetar(raw, { now: REF }))
      : tryLib(() => ourParseTaf(raw, { reference: REF }));
  console.log(`  "${raw.slice(0, 48)}"`);
  console.log(`     ours: ${ours.ok ? 'OK (no throw)' : '⚠️ threw ' + ours.err}`);
  console.log(`     lib : ${r.ok ? 'OK (no throw)' : '⚠️ threw ' + r.err}`);
}
console.log('');
