import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CloudsCard } from '../CloudsCard';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import { useSettingsStore } from '../../../store/settingsStore';

const NOW = new Date('2026-07-01T12:00:00Z');
const near: StationRef = { icao: 'EYVI', coord: { lat: 54.64, lon: 25.14 }, distanceKm: 3, bearingDeg: 200 };

const brief = (metarRaw: string) =>
  assembleBrief({
    coord: { lat: 54.66, lon: 25.22 },
    source: 'metar',
    metar: parseMetar(metarRaw, { now: NOW }),
    modelLevels: [],
    station: near,
    now: NOW,
  });

beforeEach(() => {
  useSettingsStore.setState({ altUnit: 'm' });
});

describe('CloudsCard', () => {
  it('shows human-readable layers, not bare aviation codes as primary text', () => {
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 SCT038 BKN050 12/06 Q1015')} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Scattered clouds — up to about half the sky');
    expect(txt).toContain('Broken cloud — most of the sky');
    // raw code kept only as a dim secondary tag, never a naked "SCT 3–4"
    expect(txt).toContain('SCT · 3–4/8');
    expect(txt).not.toMatch(/oktas/i);
  });

  it('marks a ceiling layer and distinguishes ceiling from cloud base', () => {
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 SCT038 BKN050 12/06 Q1015')} />);
    expect(screen.getAllByText('ceiling').length).toBeGreaterThan(0); // BKN tag
    expect(screen.getByText('Ceiling')).toBeInTheDocument();
    expect(screen.getByText(/Cloud base \(/)).toBeInTheDocument();
    expect(document.body.textContent).toContain('you can’t climb through');
  });

  it('raises a highlighted NO-FLY callout for a cumulonimbus (CB) layer', () => {
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 SCT018CB 20/17 Q1012')} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Cumulonimbus (CB)');
    expect(txt).toContain('thunderstorm cloud');
    expect(txt).toContain('no-fly');
  });

  it('raises a caution callout for towering cumulus (TCU) without changing the verdict', () => {
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 SCT018TCU 20/15 Q1012')} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Towering cumulus (TCU)');
    expect(txt).toContain('caution');
    expect(txt).not.toContain('Cumulonimbus');
  });

  it('shows a drone-relevance line against the 120 m ops band', () => {
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 SCT038 12/06 Q1015')} />);
    expect(document.body.textContent).toContain('operating band');
  });

  it('reacts to altitude unit selection', () => {
    useSettingsStore.setState({ altUnit: 'ft' });
    render(<CloudsCard brief={brief('EYVI 011200Z 22010KT 9999 BKN050 12/06 Q1015')} />);
    expect(document.body.textContent).toContain('5000 ft above ground');
  });
});
