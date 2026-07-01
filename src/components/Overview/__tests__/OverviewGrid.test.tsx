import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { OverviewGrid } from '../OverviewGrid';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { daylight } from '../../../domain/sun';
import { parseMetar } from '../../../domain/metar';
import { useSettingsStore } from '../../../store/settingsStore';

const NOW = new Date('2026-06-28T13:00:00Z'); // midsummer midday UTC — sun up over Vilnius
const NIGHT = new Date('2026-06-28T23:30:00Z'); // sun down even at 54.6°N in June
const VILNIUS = { lat: 54.6, lon: 25.28 };
const station: StationRef = { icao: 'EYVI', name: 'Vilnius Intl Arpt, LT', coord: VILNIUS, distanceKm: 5, bearingDeg: 90 };

const brief = (raw: string, now = NOW) =>
  assembleBrief({
    coord: VILNIUS,
    source: 'metar',
    metar: parseMetar(raw, { now }),
    modelLevels: [],
    station,
    now,
  });

describe('OverviewGrid', () => {
  beforeEach(() => {
    useSettingsStore.setState({ windUnit: 'ms' });
  });

  it('renders all four tiles from a sample brief', () => {
    const b = brief('EYVI 281250Z 13004KT 090V150 9999 SCT030 20/18 Q1015');
    render(<OverviewGrid brief={b} daylight={daylight(NOW, VILNIUS)} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Now');
    expect(txt).toContain('Temp & moisture');
    expect(txt).toContain('Wind');
    expect(txt).toContain('Daylight');
    // Current weather: SCT by day → partly cloudy, 20°C.
    expect(txt).toContain('Partly cloudy');
    expect(txt).toContain('20');
    // Thermo: RH from 20/18 ≈ 88%, dew point + spread shown.
    expect(txt).toMatch(/8[78]% humidity/);
    expect(txt).toContain('Dew 18°C');
    expect(txt).toContain('Δ 2°C');
    // Wind: 4 kt ≈ 2.1 m/s from 130° SE, variable sector compact.
    expect(txt).toContain('2.1');
    expect(txt).toContain('m/s');
    expect(txt).toContain('from 130° SE');
    expect(txt).toContain('var 90°–150°');
    // Daylight: sunrise/sunset arrows + remaining time present.
    expect(txt).toMatch(/↑ \d{2}:\d{2} · ↓ \d{2}:\d{2}/);
    expect(txt).toMatch(/left/);
  });

  it('respects the selected wind unit', () => {
    useSettingsStore.setState({ windUnit: 'kt' });
    const b = brief('EYVI 281250Z 13010KT 9999 SCT030 20/18 Q1015');
    render(<OverviewGrid brief={b} daylight={daylight(NOW, VILNIUS)} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('10');
    expect(txt).toContain('kt');
    expect(txt).not.toContain('m/s');
  });

  it('shows gusts compactly in the wind tile', () => {
    const b = brief('EYVI 281250Z 13010G20KT 9999 SCT030 20/18 Q1015');
    render(<OverviewGrid brief={b} daylight={daylight(NOW, VILNIUS)} now={NOW} />);
    expect(document.body.textContent).toMatch(/Gusts 10\.3 m\/s/);
  });

  it('night state: moon condition and next sunrise instead of daylight remaining', () => {
    const b = brief('EYVI 282320Z 00000KT CAVOK 14/12 Q1016', NIGHT);
    render(<OverviewGrid brief={b} daylight={daylight(NIGHT, VILNIUS)} now={NIGHT} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Clear night');
    expect(txt).toMatch(/Sunrise \d{2}:\d{2}/);
    expect(txt).not.toMatch(/left/);
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
    render(<OverviewGrid brief={b} daylight={daylight(NOW, VILNIUS)} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('model');
    expect(txt).toContain('Rain likely');
  });

  it('renders dashes gracefully when temperature is missing', () => {
    const b = brief('EYVI 281250Z 13004KT 9999 SCT030 Q1015');
    render(<OverviewGrid brief={b} daylight={daylight(NOW, VILNIUS)} now={NOW} />);
    expect(document.body.textContent).toContain('—');
  });
});
