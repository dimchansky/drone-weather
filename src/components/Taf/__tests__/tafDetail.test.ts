import { describe, it, expect } from 'vitest';
import { describeWeather, describeCloud, periodTypeLabel, periodDetailBits } from '../tafDetail';
import { makeCloudLayer } from '../../../domain/clouds';
import { parseTaf } from '../../../domain/taf';
import type { Weather } from '../../../domain/types';

const w = (over: Partial<Weather>): Weather => ({ raw: '', intensity: '', phenomena: [], ...over });
const REF = new Date('2026-07-01T08:00:00Z');

describe('describeWeather', () => {
  it('humanizes intensity + phenomena', () => {
    expect(describeWeather(w({ intensity: '-', phenomena: ['RA'] }))).toBe('light rain');
    expect(describeWeather(w({ phenomena: ['BR'] }))).toBe('mist');
    expect(describeWeather(w({ phenomena: ['FG'] }))).toBe('fog');
  });

  it('handles TS / SH / FZ descriptors', () => {
    expect(describeWeather(w({ descriptor: 'TS', phenomena: ['RA'] }))).toBe('thunderstorm with rain');
    expect(describeWeather(w({ descriptor: 'TS', phenomena: [] }))).toBe('thunderstorm');
    expect(describeWeather(w({ intensity: '+', descriptor: 'SH', phenomena: ['RA'] }))).toBe('heavy showers of rain');
    expect(describeWeather(w({ descriptor: 'FZ', phenomena: ['DZ'] }))).toBe('freezing drizzle');
  });
});

describe('describeCloud', () => {
  it('humanizes cover + base in the chosen unit, plus CB', () => {
    expect(describeCloud(makeCloudLayer('BKN', 1200), 'ft')).toBe('broken 1200 ft');
    expect(describeCloud(makeCloudLayer('BKN', 1200), 'm')).toBe('broken 366 m');
    expect(describeCloud(makeCloudLayer('BKN', 2500, { cb: true }), 'ft')).toBe('broken 2500 ft CB');
    expect(describeCloud(makeCloudLayer('OVC', 400), 'ft')).toBe('overcast 400 ft');
    expect(describeCloud(makeCloudLayer('SKC', null), 'ft')).toBe('clear');
  });
});

describe('periodTypeLabel', () => {
  const t = parseTaf(
    'TAF VVTS 010800Z 0108/0212 28012KT 9999 SCT017 FM011400 27015G25KT 9999 BKN030 BECMG 0112/0114 30010KT TEMPO 0110/0114 28015G30KT 3000 TSRA BKN013CB',
    { reference: REF },
  );

  it('labels each change type in human language', () => {
    expect(periodTypeLabel(t.periods[0])).toBe('Initial forecast'); // BASE
    expect(periodTypeLabel(t.periods[1])).toBe('From'); // FM
    expect(periodTypeLabel(t.periods[2])).toBe('Becoming'); // BECMG
    expect(periodTypeLabel(t.periods[3])).toBe('Temporary — possible at times'); // TEMPO
  });

  it('includes the probability for PROB (and "at times" for PROB TEMPO)', () => {
    const p = parseTaf('TAF X 010800Z 0108/0212 28010KT 9999 SCT030 PROB30 TEMPO 0110/0114 TSRA', { reference: REF });
    expect(periodTypeLabel(p.periods.find((x) => x.changeType === 'PROB')!)).toBe('30% chance, at times');
  });
});

describe('periodDetailBits', () => {
  const t = parseTaf(
    'TAF VVTS 010800Z 0108/0212 28012KT 9999 SCT017 TEMPO 0110/0114 28015G30KT 3000 TSRA BKN013CB',
    { reference: REF },
  );
  const tempo = t.periods.find((x) => x.changeType === 'TEMPO')!;

  it('renders wind/gust/visibility/weather/clouds bits (kt / ft)', () => {
    const bits = periodDetailBits(tempo, 'kt', 'ft');
    expect(bits.some((b) => /^wind 15 kt from 280° \(W\), gusts to 30 kt$/.test(b))).toBe(true);
    expect(bits).toContain('visibility 3 km');
    expect(bits).toContain('thunderstorm with rain');
    expect(bits).toContain('broken 1300 ft CB');
  });

  it('reacts to unit selection (m/s, metres)', () => {
    const bits = periodDetailBits(tempo, 'ms', 'm');
    expect(bits.some((b) => /gusts to 15\.4 m\/s/.test(b))).toBe(true);
    expect(bits).toContain('broken 396 m CB'); // 1300 ft → 396 m, cumulonimbus
  });
});
