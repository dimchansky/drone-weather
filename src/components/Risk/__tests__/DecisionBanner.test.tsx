import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionBanner } from '../DecisionBanner';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import { SEVERITY_DISPLAY } from '../../../utils/severity';

const NOW = new Date('2026-06-28T13:00:00Z');
const near: StationRef = { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 5, bearingDeg: 270 };

const brief = (raw: string, station: StationRef = near) =>
  assembleBrief({
    coord: { lat: 51.5, lon: -0.1 },
    source: 'metar',
    metar: parseMetar(raw, { now: NOW }),
    modelLevels: [],
    station,
    now: NOW,
  });

describe('DecisionBanner', () => {
  it('renders the verdict and hedged GOOD advice, with no "Main issue", for benign weather', () => {
    const b = brief('EGLL 281250Z 27006KT CAVOK 20/07 Q1015');
    render(<DecisionBanner risk={b.risk} wind={b.metar.wind} />);
    expect(screen.getByText(SEVERITY_DISPLAY[b.risk.overall])).toBeInTheDocument();
    expect(screen.getByText(/short local VLOS/i)).toBeInTheDocument();
    expect(screen.queryByText(/Main issue/i)).not.toBeInTheDocument();
  });

  it('shows the dominant issue with its practical magnitude', () => {
    const b = brief('EGLL 281250Z 29018G30KT CAVOK 20/07 Q1015'); // strong gusty wind
    render(<DecisionBanner risk={b.risk} wind={b.metar.wind} />);
    expect(screen.getByText(/Main issue/i)).toBeInTheDocument();
    expect(document.body.textContent).toContain(b.risk.primary!.value!); // magnitude, e.g. "30 kt (+12 kt)"
  });

  it('shows a reduced-confidence note when the station is far', () => {
    const b = brief('EGLL 281250Z 27006KT CAVOK 20/07 Q1015', { ...near, distanceKm: 60 });
    render(<DecisionBanner risk={b.risk} wind={b.metar.wind} />);
    expect(screen.getByText('Reduced confidence')).toBeInTheDocument();
  });

  it('renders an optional secondary line (e.g. the daylight summary)', () => {
    const b = brief('EGLL 281250Z 27006KT CAVOK 20/07 Q1015');
    render(
      <DecisionBanner
        risk={b.risk}
        wind={b.metar.wind}
        secondary={{ text: 'Daylight OK · sunset in 6h 20m', severity: 'GOOD' }}
      />,
    );
    expect(screen.getByText('Daylight OK · sunset in 6h 20m')).toBeInTheDocument();
  });
});
