import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerticalHazardStrip } from '../VerticalHazardStrip';

describe('VerticalHazardStrip', () => {
  it('renders the ops-band conclusion text', () => {
    render(
      <VerticalHazardStrip
        hazard={{ severity: 'GOOD', text: 'Ops band 0–120 m: low vertical hazard · cloud base above ops ceiling' }}
      />,
    );
    expect(screen.getByText(/Ops band 0–120 m: low vertical hazard/)).toBeInTheDocument();
  });
});
