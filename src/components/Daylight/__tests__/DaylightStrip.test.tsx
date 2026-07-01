import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DaylightStrip } from '../DaylightStrip';
import { daylight } from '../../../domain/sun';
import type { LocationTime } from '../../../domain/types';

const UTC: LocationTime = { utcOffsetSeconds: 0, timezone: 'UTC', source: 'open-meteo' };

describe('DaylightStrip', () => {
  it('renders the daytime daylight summary', () => {
    const dl = daylight(new Date('2026-03-20T12:07:00Z'), { lat: 0, lon: 0 });
    render(<DaylightStrip daylight={dl} locationTime={UTC} />);
    expect(screen.getByText(/Sunrise .* sunset .* daylight left/)).toBeInTheDocument();
  });

  it('renders a night advisory', () => {
    const dl = daylight(new Date('2026-03-20T00:00:00Z'), { lat: 0, lon: 0 });
    render(<DaylightStrip daylight={dl} locationTime={UTC} />);
    expect(screen.getByText(/Night — little usable light/)).toBeInTheDocument();
  });
});
