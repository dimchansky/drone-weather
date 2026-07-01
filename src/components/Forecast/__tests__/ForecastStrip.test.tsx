import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastStrip } from '../ForecastStrip';
import type { ForecastSummary } from '../../../domain/forecast';

const summary = (over: Partial<ForecastSummary> = {}): ForecastSummary => ({
  available: true,
  horizonH: 3,
  windTrend: 'steady',
  windNowKt: 8,
  windPeakKt: 8,
  windLowKt: 8,
  gustPeakKt: null,
  gustRising: false,
  rainOnsetMin: null,
  rainProbPeak: null,
  rainAmountPeak: null,
  severity: 'GOOD',
  ...over,
});

describe('ForecastStrip', () => {
  it('renders the model forecast line', () => {
    render(<ForecastStrip forecast={summary()} windUnit="kt" />);
    expect(screen.getByText(/Next 3h \(model\): wind steady · no rain expected/)).toBeInTheDocument();
  });

  it('renders nothing when the forecast is unavailable', () => {
    const { container } = render(<ForecastStrip forecast={summary({ available: false })} windUnit="kt" />);
    expect(container).toBeEmptyDOMElement();
  });
});
