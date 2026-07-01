import { describe, it, expect } from 'vitest';
import { parseTaf } from '../taf';
import { ceilingFt } from '../clouds';
import { hasThunderstorm, hasPrecip } from '../metar';

// Fixed reference near the validity start so day/hour groups resolve deterministically (UTC).
const REF = new Date('2026-07-01T08:00:00Z');
const p = (raw: string) => parseTaf(raw, { reference: REF });

describe('parseTaf — header + base', () => {
  it('parses a simple steady TAF (base only)', () => {
    const t = p('TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035');
    expect(t.icao).toBe('EGLL');
    expect(t.validFrom?.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(t.validTo?.toISOString()).toBe('2026-07-02T12:00:00.000Z');
    expect(t.periods).toHaveLength(1);
    const b = t.periods[0];
    expect(b.changeType).toBe('BASE');
    expect(b.wind).toMatchObject({ dirDeg: 220, speedKt: 10, gustKt: null });
    expect(b.visibilityM).toBe(10000);
    expect(b.clouds[0]).toMatchObject({ cover: 'SCT', baseFt: 3500 });
    expect(t.warnings).toEqual([]);
  });
});

describe('parseTaf — change groups', () => {
  it('FM introduces a new prevailing wind + gusts from a time', () => {
    const t = p('TAF EDDB 010800Z 0109/0209 24008KT 9999 SCT035 FM011400 27015G25KT 9999 BKN030');
    expect(t.periods).toHaveLength(2);
    const fm = t.periods[1];
    expect(fm.changeType).toBe('FM');
    expect(fm.from?.toISOString()).toBe('2026-07-01T14:00:00.000Z');
    expect(fm.to).toBeNull();
    expect(fm.wind).toMatchObject({ dirDeg: 270, speedKt: 15, gustKt: 25 });
    expect(fm.clouds[0]).toMatchObject({ cover: 'BKN', baseFt: 3000 });
  });

  it('TEMPO carries rain + reduced visibility over a window', () => {
    const t = p('TAF LFPG 010500Z 0106/0212 20012KT 9999 BKN025 TEMPO 0108/0112 4000 -RA BKN012');
    const tempo = t.periods.find((x) => x.changeType === 'TEMPO')!;
    expect(tempo.tempo).toBe(true);
    expect(tempo.from?.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(tempo.to?.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(tempo.visibilityM).toBe(4000);
    expect(hasPrecip(tempo)).toBe(true);
    expect(ceilingFt(tempo.clouds)).toBe(1200);
  });

  it('PROB30 TEMPO captures probability + a thunderstorm (CB)', () => {
    const t = p('TAF KMCI 011130Z 0112/0212 18010KT P6SM SCT040 PROB30 TEMPO 0118/0122 TSRA BKN025CB');
    const prob = t.periods.find((x) => x.changeType === 'PROB')!;
    expect(prob.probPct).toBe(30);
    expect(prob.tempo).toBe(true);
    expect(prob.from?.toISOString()).toBe('2026-07-01T18:00:00.000Z');
    expect(hasThunderstorm(prob)).toBe(true);
    expect(prob.clouds[0].cb).toBe(true);
  });

  it('BECMG carries a becoming wind + gusts over its window', () => {
    const t = p('TAF EHAM 010500Z 0106/0212 21010KT 9999 SCT030 BECMG 0108/0110 24016G28KT');
    const bec = t.periods.find((x) => x.changeType === 'BECMG')!;
    expect(bec.from?.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(bec.to?.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(bec.wind).toMatchObject({ dirDeg: 240, speedKt: 16, gustKt: 28 });
  });

  it('captures a low ceiling (OVC)', () => {
    const t = p('TAF EGKK 010500Z 0106/0212 18008KT 6000 OVC004');
    expect(ceilingFt(t.periods[0].clouds)).toBe(400);
    expect(t.periods[0].visibilityM).toBe(6000);
  });
});

describe('parseTaf — robustness', () => {
  it('records unsupported tokens as warnings (partial parse) without failing', () => {
    const t = p('TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT TX35/0122Z TNM01/0210Z');
    expect(t.periods[0].wind).toMatchObject({ dirDeg: 270, speedKt: 15 }); // base still parsed
    expect(t.warnings).toContain('WS020/23045KT');
    expect(t.warnings.some((w) => w.startsWith('TX'))).toBe(true);
    expect(t.warnings.some((w) => w.startsWith('TN'))).toBe(true);
  });

  it('resolves day/hour groups across a month boundary', () => {
    const t = parseTaf('TAF EGLL 312300Z 0100/0206 25010KT 9999 SCT040', {
      reference: new Date('2026-07-31T23:00:00Z'),
    });
    expect(t.validFrom?.getUTCMonth()).toBe(7); // August (rolled over from 31 July)
    expect(t.validFrom?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('never throws on mangled input', () => {
    expect(() => parseTaf('not a taf really', { reference: REF })).not.toThrow();
    expect(() => parseTaf('', { reference: REF })).not.toThrow();
  });
});
