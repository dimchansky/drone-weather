import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ForecastTimelineCard, assignRows, bandChips } from '../ForecastTimelineCard';
import type { TafBandOverlay } from '../../../domain/tafTimeline';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import { parseTaf } from '../../../domain/taf';
import type { LocationTime, TimelineHour } from '../../../domain/types';
import { useSettingsStore } from '../../../store/settingsStore';

const NOW = new Date('2026-06-28T12:10:00Z');
const REF = new Date('2026-06-28T06:00:00Z');
const VILNIUS = { lat: 54.6, lon: 25.28 };
const TZ: LocationTime = { utcOffsetSeconds: 3 * 3600, timezone: 'Europe/Vilnius', source: 'open-meteo' };
const station: StationRef = { icao: 'EYVI', name: 'Vilnius Intl, VL, LT', coord: VILNIUS, distanceKm: 5, bearingDeg: 90 };

/** 12 model hours from 12Z; probability intentionally null for the last 4 hours. */
const hoursFixture = (): TimelineHour[] =>
  Array.from({ length: 12 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 5, 28, 12 + i)),
    tempC: 15 + (i % 4),
    dewpC: 12,
    rhPct: 80,
    windDirDeg: 240,
    windKt: 10 + i,
    gustKt: i === 2 ? 25 : null,
    precipMm: i === 1 ? 0.6 : 0,
    precipProb: i < 8 ? 40 : null,
    cloudCoverPct: 60,
    cloudCoverLowPct: 30,
  }));

const makeBrief = (taf: string | null, timeline = hoursFixture()) =>
  assembleBrief({
    coord: VILNIUS,
    source: taf ? 'metar' : 'model',
    metar: parseMetar('EYVI 281150Z 24010KT 9999 SCT030 18/12 Q1015', { now: NOW }),
    taf: taf ? { icao: 'EYVI', issuedAt: REF, validFrom: REF, validTo: new Date('2026-06-29T06:00:00Z'), raw: taf } : null,
    modelLevels: [],
    timeline,
    locationTime: TZ,
    station: taf ? station : null,
    now: NOW,
  });

const TAF_RAW =
  'EYVI 280500Z 2806/2906 24008KT 9999 SCT030 BECMG 2814/2816 30015G28KT PROB30 TEMPO 2817/2821 3000 TSRA BKN008CB';

const renderCard = (tafRaw: string | null, timeline?: TimelineHour[]) => {
  const brief = makeBrief(tafRaw, timeline);
  const parsed = tafRaw ? parseTaf(tafRaw, { reference: REF }) : null;
  return render(<ForecastTimelineCard brief={brief} taf={parsed} now={NOW} />);
};

describe('ForecastTimelineCard', () => {
  beforeEach(() => {
    useSettingsStore.setState({ windUnit: 'ms', altUnit: 'ft' });
  });

  it('renders the model lane: local times, temps, rain, wind in the selected unit', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Next 12 hours');
    expect(txt).toContain('Now'); // first column
    expect(txt).toContain('16:00'); // 13Z in Europe/Vilnius (+3)
    expect(txt).toContain('02:00'); // 23Z — last column, local
    expect(txt).toContain('15°');
    expect(txt).toContain('0.6'); // rain mm
    expect(txt).toContain('Wind m/s');
    expect(txt).toContain('5.1'); // 10 kt → m/s
    expect(txt).toContain('12.9'); // gust 25 kt → m/s
    expect(txt).toContain('point forecast at your coordinates');
    expect(txt).toContain('Rain'); // merged amount+probability row
    expect(txt).toContain('40%'); // probability rendered inside the rain cells
  });

  it('respects the wind unit setting', () => {
    useSettingsStore.setState({ windUnit: 'kt' });
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Wind kt');
    expect(txt).toContain('10');
    expect(txt).not.toContain('m/s');
  });

  it('renders missing probabilities and gusts as dashes, never zeros', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('—');
    // 8 hours have prob 40, 4 have null → at least 4 dashes from prob + 11 from gusts.
    const dashes = (txt.match(/—/g) ?? []).length;
    expect(dashes).toBeGreaterThanOrEqual(15);
  });

  it('renders the TAF lanes as stacked value chips with qualifiers', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('TAF EYVI');
    expect(txt).toContain('airport forecast');
    expect(txt).toContain('No hazards'); // benign prevailing segment
    expect(txt).toContain('→ Changing'); // BECMG qualifier chip
    expect(txt).toContain('Gust 14.4 m/s'); // 28 kt in the selected wind unit
    expect(txt).toContain('30% · at times'); // PROB TEMPO qualifier chip
    expect(txt).toContain('Thunderstorms'); // TS group → human wording
    expect(txt).toContain('Ceiling 800 ft'); // BKN008 value, in the selected alt unit
    expect(txt).toContain('Vis 3 km');
  });

  it('switches ceiling chips with the altitude unit', () => {
    useSettingsStore.setState({ altUnit: 'm' });
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Ceiling 244 m');
    expect(txt).not.toContain('Ceiling 800 ft');
  });

  it('switches gust chips with the wind unit', () => {
    useSettingsStore.setState({ windUnit: 'kt' });
    renderCard(TAF_RAW);
    expect(document.body.textContent).toContain('Gust 28 kt');
  });

  it('shows a short human legend and the one-line source footer', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Forecast');
    expect(txt).toContain('At times / possible');
    expect(txt).toContain('→ Changing');
    expect(txt).toContain('Model = point forecast at your coordinates · TAF = airport forecast');
  });

  it('CB without a TS group reads as storm clouds with its base', () => {
    renderCard('EYVI 280500Z 2806/2906 24008KT 9999 BKN015CB');
    expect(document.body.textContent).toContain('Storm clouds (CB) 1500 ft');
  });

  it('TCU renders a building-clouds chip even without hazards', () => {
    renderCard('EYVI 280500Z 2806/2906 24008KT 9999 SCT020TCU');
    expect(document.body.textContent).toContain('Building clouds (TCU) 2000 ft');
  });

  it('model-only brief: model lane renders, TAF lane says there is no airport forecast', () => {
    renderCard(null);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('point forecast at your coordinates');
    expect(txt).toContain('no nearby airport forecast');
    expect(txt).not.toContain('No hazards'); // no band, no legend
    expect(txt).not.toContain('At times / possible');
  });

  it('assignRows stacks overlapping windows and reuses rows for sequential ones', () => {
    const w = (fromH: number, toH: number) => ({
      from: new Date(Date.UTC(2026, 5, 28, fromH)),
      to: new Date(Date.UTC(2026, 5, 28, toH)),
    });
    expect(assignRows([w(12, 16), w(15, 19)])).toEqual([0, 1]); // overlap → stacked
    expect(assignRows([w(12, 14), w(14, 18)])).toEqual([0, 0]); // sequential → same row
  });

  it('bandChips caps at 4 chips + "+N more"', () => {
    const item: TafBandOverlay = {
      from: new Date(),
      to: new Date(),
      tempo: true,
      hazards: ['thunderstorm', 'lowCeiling', 'lowVis', 'gusts', 'strongWind'],
      tsGroup: true,
      gustKt: 30,
      ceilingFt: 500,
      visM: 2000,
      tcuBaseFt: 2000,
      wxRaw: ['TSRA'],
    };
    const chips = bandChips(item, 'kt', 'ft');
    expect(chips).toHaveLength(5);
    expect(chips[4].text).toBe('+2 more');
  });

  it('renders nothing without timeline hours', () => {
    renderCard(TAF_RAW, []);
    expect(document.body.textContent).toBe('');
  });

  it('marks a day change with a weekday label', () => {
    renderCard(TAF_RAW);
    // 21Z UTC = 00:00 Mon 29 June in Vilnius.
    expect(document.body.textContent).toContain('Mon');
  });
});
