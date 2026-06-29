import { describe, it, expect } from 'vitest';
import { altitudeTicks } from '../ticks';

describe('altitudeTicks', () => {
  it('uses drone-relevant labels on the 0–150 m view', () => {
    expect(altitudeTicks(150)).toEqual([0, 30, 50, 100, 150]);
  });

  it('uses sparse major labels on the 0–1000 m view (incl. 750 m to break the gap)', () => {
    expect(altitudeTicks(1000)).toEqual([0, 100, 300, 500, 750, 1000]);
  });

  it('filters ticks above the range', () => {
    expect(altitudeTicks(120)).toEqual([0, 30, 50, 100]);
    expect(altitudeTicks(500)).toEqual([0, 100, 300, 500]);
  });
});
