import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RawData } from '../RawData';
import { assembleBrief } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';

const NOW = new Date('2026-06-28T13:00:00Z');
const RAW = 'EGLL 281250Z 28009KT 9999 FEW035 23/07 Q1013 NOSIG';

describe('RawData', () => {
  it('always shows the raw METAR text (verification requirement)', () => {
    const brief = assembleBrief({
      coord: { lat: 51.5, lon: -0.1 },
      source: 'metar',
      metar: parseMetar(RAW, { now: NOW }),
      modelLevels: [],
      now: NOW,
    });
    render(<RawData brief={brief} />);
    expect(screen.getByText(RAW)).toBeInTheDocument();
  });
});
