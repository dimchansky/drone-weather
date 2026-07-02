import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { OverviewGrid } from '../OverviewGrid';
import { rainSoonChip } from '../CurrentWeatherTile';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { daylight } from '../../../domain/sun';
import { summarizeForecast } from '../../../domain/forecast';
import { parseMetar } from '../../../domain/metar';
import { useSettingsStore } from '../../../store/settingsStore';

const NOW = new Date('2026-06-28T13:00:00Z'); // midsummer midday UTC — sun up over Vilnius
const NIGHT = new Date('2026-06-28T23:30:00Z'); // sun down even at 54.6°N in June
const VILNIUS = { lat: 54.6, lon: 25.28 };
const station: StationRef = { icao: 'EYVI', name: 'Vilnius Intl, VL, LT', coord: VILNIUS, distanceKm: 5, bearingDeg: 90 };

const brief = (raw: string, now = NOW) =>
  assembleBrief({
    coord: VILNIUS,
    source: 'metar',
    metar: parseMetar(raw, { now }),
    modelLevels: [],
    station,
    now,
  });

const grid = (b: ReturnType<typeof brief>, now = NOW, forecast = null as Parameters<typeof OverviewGrid>[0]['forecast']) =>
  render(<OverviewGrid brief={b} daylight={daylight(now, VILNIUS)} forecast={forecast} now={now} />);

describe('OverviewGrid', () => {
  beforeEach(() => {
    useSettingsStore.setState({ windUnit: 'ms' });
  });

  it('renders all four tiles from a sample brief', () => {
    const b = brief('EYVI 281250Z 13004KT 090V150 9999 SCT030 20/18 Q1015');
    grid(b);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Now');
    expect(txt).toContain('Temp & moisture');
    expect(txt).toContain('Wind');
    expect(txt).toContain('Daylight');
    // Current weather: SCT by day → partly cloudy, 20°C, plus the precip insight line.
    expect(txt).toContain('Partly cloudy');
    expect(txt).toContain('20');
    expect(txt).toContain('No rain now');
    // Thermo: RH from 20/18 ≈ 88%, labelled Dew/Spread mini-columns + moisture status.
    expect(txt).toMatch(/8[78]%/);
    expect(txt).toContain('Dew');
    expect(txt).toContain('18°C');
    expect(txt).toContain('Spread');
    expect(txt).toContain('2°C');
    expect(txt).toContain('Very humid');
    // Wind: 4 kt ≈ 2.1 m/s, From/Drifts columns keep both bearings explicit, var chip.
    expect(txt).toContain('2.1');
    expect(txt).toContain('m/s');
    expect(txt).toContain('From');
    expect(txt).toContain('130° SE');
    expect(txt).toContain('Drifts');
    expect(txt).toContain('310° NW');
    expect(txt).toContain('Var 90–150°');
    // Daylight: phase, sunrise/sunset at the arc's feet, relative sunset, golden-hour range chip.
    expect(txt).toContain('Daylight');
    expect(txt).toMatch(/↑\d{2}:\d{2}/);
    expect(txt).toMatch(/↓\d{2}:\d{2}/);
    expect(txt).toMatch(/Sunset in \d/);
    expect(txt).toMatch(/Golden \d{2}:\d{2}–\d{2}:\d{2}/);
  });

  it('respects the selected wind unit', () => {
    useSettingsStore.setState({ windUnit: 'kt' });
    const b = brief('EYVI 281250Z 13010KT 9999 SCT030 20/18 Q1015');
    grid(b);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('10');
    expect(txt).toContain('kt');
    expect(txt).not.toContain('m/s');
  });

  it('shows gusts as a compact chip', () => {
    const b = brief('EYVI 281250Z 13010G20KT 9999 SCT030 20/18 Q1015');
    grid(b);
    expect(document.body.textContent).toMatch(/G 10\.3 m\/s/);
  });

  it('flags a small dew-point spread as near saturation', () => {
    const b = brief('EYVI 281250Z 13004KT 9999 SCT030 20/19 Q1015');
    grid(b);
    expect(document.body.textContent).toContain('Near saturation');
  });

  it('imminent rain onset reads "Rain any moment", never "Rain in ~0m"', () => {
    // An hour bucket at "now" with likely precip → rainOnsetMin 0.
    const fc = summarizeForecast(NOW, [
      { time: NOW, windKt: 8, gustKt: null, precipMm: 0.5, precipProb: 80 },
    ]);
    expect(fc.rainOnsetMin).toBe(0);
    expect(rainSoonChip('cloud', fc)).toBe('Rain any moment');
    expect(rainSoonChip('cloud', { ...fc, rainOnsetMin: 4 })).toBe('Rain any moment');
    expect(rainSoonChip('cloud', { ...fc, rainOnsetMin: 45 })).toBe('Rain in ~45m');
    // Already-precipitating conditions still own the story — no chip.
    expect(rainSoonChip('rain', fc)).toBeNull();
    expect(rainSoonChip('cloud', null)).toBeNull();
  });

  it('shows the model rain onset as the current-weather insight', () => {
    const b = brief('EYVI 281250Z 13004KT 9999 SCT030 20/12 Q1015');
    const fc = summarizeForecast(NOW, [
      { time: new Date('2026-06-28T14:00:00Z'), windKt: 8, gustKt: null, precipMm: 0.5, precipProb: 80 },
    ]);
    grid(b, NOW, fc);
    const txt = document.body.textContent ?? '';
    expect(txt).toMatch(/Rain in ~/);
    expect(txt).not.toContain('No rain now');
  });

  it('night state: moon condition, phase, next sunrise (clock + relative) and dawn context', () => {
    const b = brief('EYVI 282320Z 00000KT CAVOK 14/12 Q1016', NIGHT);
    grid(b, NIGHT);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Clear night');
    expect(txt).toContain('Night');
    expect(txt).toMatch(/Sunrise \d{2}:\d{2}/);
    expect(txt).toMatch(/in \d+h \d+m|in \d+m/); // relative time to sunrise
    expect(txt).toMatch(/Dawn \d{2}:\d{2}/);
    expect(txt).not.toMatch(/Sunset in/);
  });

  it('model-only brief marks conditions with a model badge and never claims METAR wording', () => {
    const b = assembleBrief({
      coord: VILNIUS,
      source: 'model',
      metar: parseMetar('MODEL 281250Z 18006KT 9999 18/14 Q1015', { now: NOW }),
      modelLevels: [],
      model: {
        tempC2m: 18, dewp2m: 14, rh2m: 77, windKt: 6,
        precipMm: 0.5, precipProb: 80, cloudCoverPct: 90, cloudCoverLowPct: 40,
      },
      now: NOW,
    });
    grid(b);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('model');
    expect(txt).toContain('Rain likely');
  });

  it('renders dashes gracefully when temperature is missing', () => {
    const b = brief('EYVI 281250Z 13004KT 9999 SCT030 Q1015');
    grid(b);
    expect(document.body.textContent).toContain('—');
  });
});
