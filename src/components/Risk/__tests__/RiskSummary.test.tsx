import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskSummary } from '../RiskSummary';
import { assembleBrief } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import { SEVERITY_DISPLAY } from '../../../utils/severity';

const NOW = new Date('2026-06-28T13:00:00Z');
const metar = parseMetar('EGLL 281250Z 28018G30KT 9999 BKN012 03/02 Q1008', { now: NOW });
const brief = assembleBrief({
  coord: { lat: 51.5, lon: -0.1 },
  source: 'metar',
  metar,
  modelLevels: [],
  station: { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 5, bearingDeg: 270 },
  now: NOW,
});

describe('RiskSummary', () => {
  it('renders the overall status and headline', () => {
    render(<RiskSummary risk={brief.risk} />);
    expect(screen.getByText(SEVERITY_DISPLAY[brief.risk.overall])).toBeInTheDocument();
    expect(screen.getByText(brief.risk.headline)).toBeInTheDocument();
  });

  it('shows every component with its explanation (never a black box)', () => {
    render(<RiskSummary risk={brief.risk} />);
    for (const c of brief.risk.components) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(c.reason)).toBeInTheDocument();
    }
    // The eight components: 6 weather + freshness + distance.
    expect(brief.risk.components).toHaveLength(8);
  });
});
