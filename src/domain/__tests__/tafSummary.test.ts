import { describe, it, expect } from 'vitest';
import { parseTaf, summarizeTaf } from '../taf';

const REF = new Date('2026-07-01T08:00:00Z');
const sum = (raw: string, nowISO: string) =>
  summarizeTaf(parseTaf(raw, { reference: REF }), new Date(nowISO));

const kinds = (raw: string, nowISO: string) => sum(raw, nowISO).hazards.map((h) => h.kind);

describe('summarizeTaf', () => {
  it('is GOOD with no hazards for a steady benign TAF', () => {
    const s = sum('TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035', '2026-07-01T09:00:00Z');
    expect(s.available).toBe(true);
    expect(s.severity).toBe('GOOD');
    expect(s.hazards).toEqual([]);
    expect(s.partial).toBe(false);
  });

  it('flags near-term TEMPO rain + low visibility as CAUTION', () => {
    const raw = 'TAF LFPG 010500Z 0106/0212 20012KT 9999 BKN025 TEMPO 0108/0112 4000 -RA BKN012';
    const s = sum(raw, '2026-07-01T09:00:00Z'); // inside the 08–12Z TEMPO window
    expect(s.severity).toBe('CAUTION');
    expect(kinds(raw, '2026-07-01T09:00:00Z')).toEqual(expect.arrayContaining(['lowVis', 'rain']));
  });

  it('ignores a hazard outside the near-term horizon', () => {
    const raw = 'TAF LFPG 010500Z 0106/0212 20012KT 9999 BKN025 TEMPO 0108/0112 4000 -RA BKN012';
    // now well before the 08–12Z window (>6 h away) → not near-term
    expect(sum(raw, '2026-07-01T00:00:00Z').severity).toBe('GOOD');
  });

  it('surfaces a PROB thunderstorm with its probability when near-term', () => {
    const raw = 'TAF KMCI 011130Z 0112/0212 18010KT P6SM SCT040 PROB30 TEMPO 0118/0122 TSRA BKN025CB';
    const s = sum(raw, '2026-07-01T17:00:00Z'); // end 23Z overlaps the 18–22Z PROB window
    expect(s.severity).toBe('CAUTION');
    const ts = s.hazards.find((h) => h.kind === 'thunderstorm')!;
    expect(ts.probPct).toBe(30);
    expect(ts.changeType).toBe('PROB');
  });

  it('flags a forecast low ceiling', () => {
    const s = sum('TAF EGKK 010500Z 0106/0212 18008KT 6000 OVC004', '2026-07-01T09:00:00Z');
    const c = s.hazards.find((h) => h.kind === 'lowCeiling')!;
    expect(c.ceilingFt).toBe(400);
  });

  it('flags building gusts from an FM group within the horizon', () => {
    const raw = 'TAF EDDB 010800Z 0109/0209 24008KT 9999 SCT035 FM011400 27015G25KT 9999 SCT030';
    const g = sum(raw, '2026-07-01T13:00:00Z').hazards.find((h) => h.kind === 'gusts')!;
    expect(g.gustKt).toBe(25);
    expect(g.changeType).toBe('FM');
  });

  it('marks the summary partial when unsupported tokens were present', () => {
    const s = sum('TAF KDEN 011130Z 0112/0212 27015KT P6SM SCT100 WS020/23045KT', '2026-07-01T12:00:00Z');
    expect(s.partial).toBe(true);
  });

  it('computes the peak-overlap worst window and the whole hazard span', () => {
    // TS 12–21Z, low cloud (BKN002) 20–03Z, low vis (3000) 12–03Z → all three overlap 20–21Z.
    const raw =
      'TAF EYVI 011000Z 0112/0212 22010KT 9999 SCT030 TEMPO 0112/0121 TSRA BKN020CB TEMPO 0120/0203 0800 BKN002 TEMPO 0112/0203 3000 BR';
    const s = sum(raw, '2026-07-01T19:00:00Z'); // now inside the overlap band
    expect(s.hazards.map((h) => h.kind)).toEqual(expect.arrayContaining(['thunderstorm', 'lowCeiling', 'lowVis']));
    expect(s.worstWindow).not.toBeNull();
    expect(s.worstWindow!.from.toISOString()).toBe('2026-07-01T20:00:00.000Z');
    expect(s.worstWindow!.to.toISOString()).toBe('2026-07-01T21:00:00.000Z');
    expect(s.worstWindow!.kinds).toHaveLength(3);
    expect(s.hazardSpan!.from.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(s.hazardSpan!.to.toISOString()).toBe('2026-07-02T03:00:00.000Z');
  });

  it('has no worst window for a single hazard (but still a span)', () => {
    const s = sum('TAF EGKK 010500Z 0106/0212 18008KT 6000 OVC004', '2026-07-01T09:00:00Z');
    expect(s.worstWindow).toBeNull();
    expect(s.hazardSpan).not.toBeNull();
  });

  it('aggregates two adjacent TEMPO thunderstorm periods into one spanning window', () => {
    const raw =
      'TAF VVTS 010500Z 0106/0212 28012KT 9999 FEW020 TEMPO 0108/0110 TSRA BKN015CB TEMPO 0110/0114 TSRA BKN013CB';
    const s = sum(raw, '2026-07-01T09:00:00Z'); // both 08–10Z and 10–14Z windows are near-term
    const storms = s.hazards.filter((h) => h.kind === 'thunderstorm');
    expect(storms).toHaveLength(1);
    expect(storms[0].from?.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(storms[0].to?.toISOString()).toBe('2026-07-01T14:00:00.000Z');
  });
});
