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
});
