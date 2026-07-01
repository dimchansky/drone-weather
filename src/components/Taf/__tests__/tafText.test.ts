import { describe, it, expect } from 'vitest';
import { tafStripText, tafBannerNote, hazardPhrase } from '../tafText';
import type { TafHazard, TafSummary } from '../../../domain/taf';
import type { LocationTime } from '../../../domain/types';

// Fixed location zones make the local-time output deterministic (no device-tz dependency).
const PLUS7: LocationTime = { utcOffsetSeconds: 7 * 3600, timezone: 'Asia/Ho_Chi_Minh', source: 'open-meteo' };
const MINUS7: LocationTime = { utcOffsetSeconds: -7 * 3600, timezone: 'America/Los_Angeles', source: 'open-meteo' };

const hz = (h: Partial<TafHazard> & { kind: TafHazard['kind'] }): TafHazard => ({
  changeType: 'TEMPO',
  tempo: true,
  from: null,
  to: null,
  ...h,
});
const summary = (hazards: TafHazard[], over: Partial<TafSummary> = {}): TafSummary => ({
  available: true,
  severity: hazards.length ? 'CAUTION' : 'GOOD',
  hazards,
  partial: false,
  icao: 'VVTS',
  horizonH: 6,
  ...over,
});

const win = (fromZ: string, toZ?: string) => ({ from: new Date(fromZ), to: toZ ? new Date(toZ) : null });

describe('hazardPhrase — jargon expansion + location-time windows', () => {
  it('TEMPO → "possible at times"; location-time primary (UTC+7), UTC secondary', () => {
    const t = hazardPhrase(hz({ kind: 'thunderstorm', changeType: 'TEMPO', tempo: true, ...win('2026-07-01T08:00:00Z', '2026-07-01T14:00:00Z') }), 'kt', 'ft', PLUS7);
    expect(t).toBe('thunderstorms possible at times 15:00–21:00 (08:00–14:00 UTC)');
  });

  it('applies a negative offset (UTC−7)', () => {
    const t = hazardPhrase(hz({ kind: 'thunderstorm', changeType: 'TEMPO', tempo: true, ...win('2026-07-01T08:00:00Z', '2026-07-01T14:00:00Z') }), 'kt', 'ft', MINUS7);
    expect(t).toBe('thunderstorms possible at times 01:00–07:00 (08:00–14:00 UTC)');
  });

  it('PROB30 TEMPO → "30% chance of … at times"', () => {
    const t = hazardPhrase(hz({ kind: 'thunderstorm', changeType: 'PROB', probPct: 30, tempo: true, ...win('2026-07-01T18:00:00Z', '2026-07-01T22:00:00Z') }), 'kt', 'ft', PLUS7);
    expect(t).toMatch(/^30% chance of thunderstorms at times /);
    expect(t).toMatch(/\(18:00–22:00 UTC\)$/);
  });

  it('BECMG → "becoming"; FM → "from"; gusts in the chosen wind unit', () => {
    const becmg = hazardPhrase(hz({ kind: 'gusts', changeType: 'BECMG', tempo: false, gustKt: 28, ...win('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z') }), 'kt', 'ft', PLUS7);
    expect(becmg).toBe('gusts to 28 kt becoming 15:00–17:00 (08:00–10:00 UTC)');
    const fm = hazardPhrase(hz({ kind: 'gusts', changeType: 'FM', tempo: false, gustKt: 25, ...win('2026-07-01T14:00:00Z') }), 'ms', 'ft', PLUS7);
    expect(fm).toBe('gusts to 12.9 m/s from 21:00 (14:00 UTC)');
  });
});

describe('tafStripText', () => {
  it('says no significant change when there are no hazards', () => {
    expect(tafStripText(summary([]), 'kt', 'ft', PLUS7)).toBe(
      'TAF VVTS · airport forecast: no significant change next 6 h',
    );
  });

  it('renders plain language with no raw aviation codes', () => {
    const s = summary([
      hz({ kind: 'thunderstorm', changeType: 'TEMPO', tempo: true, ...win('2026-07-01T08:00:00Z', '2026-07-01T14:00:00Z') }),
      hz({ kind: 'lowVis', changeType: 'TEMPO', tempo: true, visM: 3000, ...win('2026-07-01T10:00:00Z', '2026-07-01T14:00:00Z') }),
    ]);
    const txt = tafStripText(s, 'kt', 'ft', PLUS7);
    expect(txt).toMatch(/thunderstorms possible at times 15:00–21:00/);
    expect(txt).toMatch(/reduced visibility \(3 km\)/);
    expect(txt).not.toMatch(/TEMPO|PROB\d|BECMG| FM\d/);
  });

  it('shows an explicit "+N more" instead of a bare ellipsis', () => {
    const many = [
      hz({ kind: 'thunderstorm', ...win('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z') }),
      hz({ kind: 'lowCeiling', ceilingFt: 400, ...win('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z') }),
      hz({ kind: 'lowVis', visM: 2000, ...win('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z') }),
      hz({ kind: 'gusts', gustKt: 30, ...win('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z') }),
    ];
    const txt = tafStripText(summary(many), 'kt', 'ft', PLUS7);
    expect(txt).not.toContain('…');
    expect(txt).toMatch(/\+1 more TAF hazard\b/);
  });

  it('flags a partial parse', () => {
    expect(tafStripText(summary([], { partial: true }), 'kt', 'ft', PLUS7)).toMatch(/parsed partially — check raw/);
  });
});

describe('tafBannerNote', () => {
  it('is null without a thunderstorm', () => {
    expect(tafBannerNote(summary([hz({ kind: 'rain' })]), PLUS7)).toBeNull();
  });

  it('gives a plain-language thunderstorm note in location time', () => {
    const s = summary([hz({ kind: 'thunderstorm', changeType: 'PROB', probPct: 30, tempo: true, ...win('2026-07-01T18:00:00Z', '2026-07-01T22:00:00Z') })]);
    const note = tafBannerNote(s, PLUS7)!;
    expect(note).toBe('TAF: 30% chance of thunderstorms at times 01:00–05:00 (18:00–22:00 UTC)');
  });
});
