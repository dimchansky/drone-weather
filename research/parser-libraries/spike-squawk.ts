/*
 * Spike 2: probe @squawk/weather (v0.6.0) — the only other TAF-capable candidate. Focus on the
 * decision-relevant differences vs our parser: PROB(30) TEMPO representation, WS/TX/TN handling,
 * cloud CB/TCU, CAVOK, and throw-vs-degrade robustness. Research only. Run: `npx tsx spike-squawk.ts`.
 */
import { parseMetar as sqMetar, parseTaf as sqTaf } from '@squawk/weather';

const j = (v: unknown) => (v == null ? '·' : String(v));

function tryFn<T>(fn: () => T): { ok: true; v: T } | { ok: false; e: string } {
  try {
    return { ok: true, v: fn() };
  } catch (e) {
    return { ok: false, e: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

const METARS: [string, string][] = [
  ['CAVOK', 'EYVI 011200Z 22010KT CAVOK 20/09 Q1019'],
  ['CB', 'LSZH 011220Z 20004KT 150V280 9999 FEW035 FEW040CB 23/14 Q1022'],
  ['TCU', 'SBCH 011500Z 09006KT 8000 FEW006 BKN030 FEW040TCU BKN070 19/19 Q1017'],
  ['FZRA+VV', 'CYYZ 011200Z 09012KT 1/2SM FZRA BR VV004 M01/M02 A2980'],
  ['MPS wind', 'UUEE 011230Z 27006MPS 9999 BKN020 15/10 Q1009'],
  ['auto ///', 'ESSA 011220Z AUTO 30015G27KT 9999 BKN014/// //////CB 08/05 Q0998'],
];

console.log('\n===== @squawk/weather METAR =====\n');
for (const [label, raw] of METARS) {
  const r = tryFn(() => sqMetar(raw));
  if (!r.ok) {
    console.log(`### ${label}\n    ${raw}\n  ⚠️ THREW ${r.e}\n`);
    continue;
  }
  const m: any = r.v;
  const w = m.wind;
  const wind = w ? `${w.isVariable ? 'VRB' : w.directionDeg + '°'} ${w.speedKt}${w.gustKt ? 'G' + w.gustKt : ''}kt${w.variableFromDeg != null ? ` var ${w.variableFromDeg}/${w.variableToDeg}` : ''}` : '·';
  const clouds = (m.sky?.layers ?? []).map((c: any) => `${c.coverage}${c.altitudeFtAgl}${c.type ? '/' + c.type : ''}`).join(' ');
  console.log(`### ${label}\n    ${raw}`);
  console.log(`  sq: station=${j(m.stationId)} wind=${wind} vis=sm${j(m.visibility?.visibilitySm)}/m${j(m.visibility?.visibilityM)} cavok=${m.isCavok ?? m.cavok ?? '?'} wx=[${(m.weather ?? []).map((x: any) => x.raw).join(',')}] clouds=[${clouds}]${m.sky?.verticalVisibilityFtAgl ? ' VV' + m.sky.verticalVisibilityFtAgl : ''} T/Td=${j(m.temperature?.celsius ?? m.temperatureC)}/${j(m.dewpoint?.celsius ?? m.dewpointC)} alt=hPa${j(m.altimeter?.hPa)}/inHg${j(m.altimeter?.inHg)} cat=${j(m.flightCategory)}`);
  console.log('');
}

const TAFS: [string, string][] = [
  ['PROB30 TEMPO', 'TAF KMCI 011130Z 0112/0212 18010KT P6SM SCT040 PROB30 TEMPO 0118/0122 TSRA BKN025CB'],
  ['WS + TX/TN', 'TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT TX35/0122Z TNM01/0210Z'],
  ['multi-hazard', 'TAF EYVI 011000Z 0112/0212 22010KT 9999 SCT030 TEMPO 0112/0121 TSRA BKN020CB TEMPO 0120/0203 0800 BKN002 TEMPO 0112/0203 3000 BR'],
];

console.log('\n===== @squawk/weather TAF =====\n');
for (const [label, raw] of TAFS) {
  console.log(`### ${label}\n    ${raw}`);
  const r = tryFn(() => sqTaf(raw));
  if (!r.ok) {
    console.log(`  ⚠️ THREW ${r.e}\n`);
    continue;
  }
  const t: any = r.v;
  console.log(`  validity=${JSON.stringify(t.validity ?? t.validFrom)} maxT=${j(t.maxTemperatureC ?? t.maxTemperature)} minT=${j(t.minTemperatureC ?? t.minTemperature)}`);
  for (const g of t.forecast ?? []) {
    const w = g.wind;
    const wind = w ? `${w.isVariable ? 'VRB' : w.directionDeg + '°'} ${w.speedKt}${w.gustKt ? 'G' + w.gustKt : ''}kt` : '·';
    const clouds = (g.sky?.layers ?? []).map((c: any) => `${c.coverage}${c.altitudeFtAgl}${c.type ? c.type : ''}`).join(' ');
    console.log(`     [${j(g.changeType)}${g.probability ? ' PROB' + g.probability : ''}] ${JSON.stringify(g.start)}→${JSON.stringify(g.end)} wind=${wind} vis=m${j(g.visibility?.visibilityM)}/sm${j(g.visibility?.visibilitySm)} wx=[${(g.weather ?? []).map((x: any) => x.raw).join(',')}] clouds=[${clouds}] ws=${g.windShear ? 'Y' : '·'} icing=${g.icing?.length ?? 0}`);
  }
  console.log('');
}

console.log('\n===== ROBUSTNESS =====\n');
const EDGE: [string, 'm' | 't'][] = [
  ['FIMP 191000Z 04006KT 4000E -SHRA FEW015 BKN080 24/22 Q1015', 'm'], // aeharding issue #124 crasher
  ['GARBAGE not a metar', 'm'],
  ['', 'm'],
  ['METAR', 'm'],
  ['TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035 FOOBAR 123', 't'],
];
for (const [raw, kind] of EDGE) {
  const r = kind === 'm' ? tryFn(() => sqMetar(raw)) : tryFn(() => sqTaf(raw));
  console.log(`  "${raw.slice(0, 52)}"  ->  ${r.ok ? 'OK (no throw)' : '⚠️ threw ' + r.e}`);
}
console.log('');
