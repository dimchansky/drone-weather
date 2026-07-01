import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskFactors } from '../RiskFactors';
import { assembleBrief } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';

const NOW = new Date('2026-06-28T13:00:00Z');
const brief = assembleBrief({
  coord: { lat: 51.5, lon: -0.1 },
  source: 'metar',
  metar: parseMetar('EGLL 281250Z 28018G30KT 9999 BKN012 03/02 Q1008', { now: NOW }),
  modelLevels: [],
  station: { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 5, bearingDeg: 270 },
  now: NOW,
});

const WEATHER = ['wind', 'gust', 'visibility', 'moisture', 'ceiling', 'icing'];

describe('RiskFactors', () => {
  it('shows the six weather factors, each with its reason (never a black box)', () => {
    render(<RiskFactors risk={brief.risk} />);
    const weather = brief.risk.components.filter((c) => WEATHER.includes(c.key));
    expect(weather).toHaveLength(6);
    for (const c of weather) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(c.reason)).toBeInTheDocument();
    }
  });

  it('does not render the confidence factors (they live in the status strip)', () => {
    render(<RiskFactors risk={brief.risk} />);
    expect(screen.queryByText(/^(METAR|Data) freshness$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Station distance|Data source)$/)).not.toBeInTheDocument();
  });
});
