// Parser hardening — characterization tests locking the invariants that matter for a PWA parsing
// arbitrary live global METAR/TAF: NEVER throw, ALWAYS preserve the raw text, and record
// unsupported groups honestly in `warnings` (TAF). Edge cases surfaced during the parser-library
// research (docs/parser-library-research.md). Cases that later hardening (B1 //////CB, B2 4000E,
// B3 INTER) intentionally CHANGES are asserted here only at the invariant level (no-throw + raw +
// siblings), so these tests stay valid across those changes; the new behavior is asserted in the
// dedicated tests for each change.

import { describe, it, expect } from 'vitest';
import { parseMetar, parseCloudToken, hasThunderstorm, hasConvectiveCloud } from '../metar';
import { parseTaf } from '../taf';

const REF = new Date('2026-07-01T12:00:00Z');
const m = (raw: string) => parseMetar(raw, { now: REF });
const t = (raw: string) => parseTaf(raw, { reference: REF });

describe('parser hardening — never throws', () => {
  const JUNK = ['', ' ', '=', 'METAR', 'TAF', 'M', 'GARBAGE not a metar at all', '////////', '\n\t '];
  it('parseMetar returns an object (never throws) for empty/header-only/garbage', () => {
    for (const raw of JUNK) {
      expect(() => m(raw)).not.toThrow();
      expect(m(raw)).toBeTypeOf('object');
    }
  });
  it('parseTaf returns an object (never throws) for empty/header-only/garbage', () => {
    for (const raw of JUNK) {
      expect(() => t(raw)).not.toThrow();
      expect(t(raw).periods).toBeInstanceOf(Array);
    }
  });
});

describe('parser hardening — raw text is preserved verbatim', () => {
  it('keeps the trimmed raw METAR exactly', () => {
    const raw = 'EGLL 011220Z 24012KT 9999 SCT038 QQQ999 12/06 Q1015';
    expect(m(raw).raw).toBe(raw);
  });
  it('keeps the raw TAF (including unsupported groups)', () => {
    const raw = 'TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT TX35/0122Z TNM01/0210Z';
    expect(t(raw).raw).toBe(raw);
  });
  it('an unknown METAR token is ignored but preserved in raw; neighbours still parse', () => {
    const r = m('EGLL 011220Z 24012KT 9999 SCT038 QQQ999 12/06 Q1015');
    expect(r.raw).toContain('QQQ999');
    expect(r.clouds).toEqual([expect.objectContaining({ cover: 'SCT', baseFt: 3800 })]);
    expect(r.qnhHpa).toBe(1015);
  });
});

describe('parser hardening — TAF records unsupported groups in warnings (honest partial parse)', () => {
  it('flags wind shear (WS) and max/min temp (TX/TN) without dropping the forecast', () => {
    const r = t('TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT TX35/0122Z TNM01/0210Z');
    expect(r.warnings).toEqual(expect.arrayContaining(['WS020/23045KT', 'TX35/0122Z', 'TNM01/0210Z']));
    expect(r.periods[0].wind?.speedKt).toBe(15); // base still parsed
    expect(r.periods[0].clouds).toEqual([expect.objectContaining({ cover: 'SCT', baseFt: 10000 })]);
  });
  it('flags turbulence (5-group) and icing (6-group) TAF groups', () => {
    const r = t('TAF KABC 011130Z 0112/0212 27015KT P6SM SCT100 520004 620304');
    expect(r.warnings).toEqual(expect.arrayContaining(['520004', '620304']));
  });
});

describe('parser hardening — visibility indicators (stable behavior)', () => {
  it('P6SM (greater-than 6 SM) clamps to the ≥10 km sentinel', () => {
    expect(m('KDEN 011153Z 27015KT P6SM SCT100 10/M02 A3012').visibilityM).toBe(10000);
  });
  it('M1/4SM (less-than 1/4 SM) parses the value (indicator not modelled)', () => {
    expect(m('KSFO 011253Z 19008KT M1/4SM FG VV002 12/11 A2998').visibilityM).toBe(402);
  });
});

// Invariant-only guards for the cases the B1–B3 hardening changes — these must hold before AND
// after those changes, so they never lock in the old data-loss behavior.
describe('parser hardening — invariants across B1–B3 edge cases', () => {
  it('//////CB does not throw and keeps the sibling BKN layer + raw', () => {
    const raw = 'ESSA 011220Z AUTO 30015G27KT 9999 BKN014/// //////CB 08/05 Q0998';
    const r = m(raw);
    expect(r.raw).toBe(raw);
    expect(r.clouds).toEqual(expect.arrayContaining([expect.objectContaining({ cover: 'BKN', baseFt: 1400 })]));
  });
  it('directional visibility 4000E does not throw; weather + clouds still parse', () => {
    const r = m('FIMP 191000Z 04006KT 4000E -SHRA FEW015 BKN080 24/22 Q1015');
    expect(r.weather.map((w) => w.raw)).toContain('-SHRA');
    expect(r.clouds).toEqual(expect.arrayContaining([expect.objectContaining({ cover: 'BKN', baseFt: 8000 })]));
  });
  it('INTER does not throw and the raw group text is preserved', () => {
    const raw = 'TAF YSSY 011100Z 0112/0218 27015KT 9999 SCT030 INTER 0112/0116 4000 SHRA BKN012';
    const r = t(raw);
    expect(r.raw).toContain('INTER 0112/0116');
    expect(r.periods.length).toBeGreaterThanOrEqual(1);
  });
});

// --- B1: //////CB / //////TCU recognised as convective cloud (amount/base unknown) ---
describe('parser hardening B1 — automated //////CB / //////TCU convective marker', () => {
  it('parses //////CB into a CB layer that feeds the thunderstorm/convective logic', () => {
    const r = m('ESSA 011220Z AUTO 30015G27KT 9999 BKN014/// //////CB 08/05 Q0998');
    const cb = r.clouds.find((c) => c.cb);
    expect(cb).toMatchObject({ cover: '///', baseFt: null, cb: true, tcu: false });
    expect(hasThunderstorm(r)).toBe(true);
    expect(hasConvectiveCloud(r)).toBe(true);
    // the sibling BKN layer is still present and unaffected
    expect(r.clouds).toEqual(expect.arrayContaining([expect.objectContaining({ cover: 'BKN', baseFt: 1400 })]));
  });

  it('parses //////TCU as convective cloud but not a thunderstorm', () => {
    const l = parseCloudToken('//////TCU');
    expect(l).toMatchObject({ cover: '///', baseFt: null, cb: false, tcu: true });
    const r = m('ESSA 011220Z AUTO 30015KT 9999 //////TCU 08/05 Q0998');
    expect(hasConvectiveCloud(r)).toBe(true);
    expect(hasThunderstorm(r)).toBe(false);
  });

  it('drops a bare //////  (no CB/TCU) as noise, and keeps COVERbbb/// unchanged', () => {
    expect(parseCloudToken('//////')).toBeNull();
    expect(parseCloudToken('BKN014///')).toMatchObject({ cover: 'BKN', baseFt: 1400, cb: false, tcu: false });
  });
});
