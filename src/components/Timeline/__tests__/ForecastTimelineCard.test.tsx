import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ForecastTimelineCard } from '../ForecastTimelineCard';
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
    useSettingsStore.setState({ windUnit: 'ms' });
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

  it('renders the TAF lane with prevailing, becoming and hatched PROB TEMPO items', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('TAF EYVI');
    expect(txt).toContain('airport forecast');
    expect(txt).toContain('No hazards'); // benign prevailing segment
    expect(txt).toMatch(/→ .*Gusts/); // becoming label carries the incoming hazard
    expect(txt).toContain('30% '); // PROB percentage on the overlay
    expect(txt).toMatch(/Thunderstorms.*at times/); // TEMPO wording
  });

  it('shows a short band legend and the one-line source footer', () => {
    renderCard(TAF_RAW);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('At times / probability');
    expect(txt).toContain('→ Changing');
    expect(txt).toContain('Model = point forecast at your coordinates · TAF = airport forecast');
    expect(txt).not.toContain('Hatched ='); // old long footer gone
  });

  it('model-only brief: model lane renders, TAF lane says there is no airport forecast', () => {
    renderCard(null);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('point forecast at your coordinates');
    expect(txt).toContain('no nearby airport forecast');
    expect(txt).not.toContain('No hazards'); // no band, no legend
    expect(txt).not.toContain('At times / probability');
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
