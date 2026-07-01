import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrecipNowPill } from '../PrecipNowPill';

describe('PrecipNowPill', () => {
  it('renders observed precipitation text', () => {
    render(<PrecipNowPill precip={{ raining: true, text: 'METAR: rain now', source: 'metar' }} />);
    expect(screen.getByText('METAR: rain now')).toBeInTheDocument();
  });

  it('renders a model probability without implying observation', () => {
    render(<PrecipNowPill precip={{ raining: false, text: 'Model: 70% precip chance', source: 'model' }} />);
    expect(screen.getByText('Model: 70% precip chance')).toBeInTheDocument();
  });

  it('renders the dry state', () => {
    render(<PrecipNowPill precip={{ raining: false, text: 'No precipitation reported now', source: 'none' }} />);
    expect(screen.getByText('No precipitation reported now')).toBeInTheDocument();
  });
});
