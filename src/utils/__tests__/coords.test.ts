import { describe, it, expect } from 'vitest';
import {
  parseCoordinateInput,
  parseLatitudeInput,
  parseLongitudeInput,
  parseCoordinatePair,
} from '../coords';

describe('parseCoordinateInput', () => {
  it.each([
    ['54.66508', 54.66508],
    ['54,66508', 54.66508], // decimal comma (mobile locale)
    [' 54,66508 ', 54.66508], // surrounding spaces
    ['25.21689', 25.21689],
    ['-54.5', -54.5],
    ['−25,5', -25.5], // unicode minus + comma
    ['+12,3', 12.3],
    ['0', 0],
    ['.5', 0.5],
    ['90', 90],
  ])('parses %j -> %j', (input, expected) => {
    expect(parseCoordinateInput(input)).toBeCloseTo(expected, 6);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['54,66,508'], // two commas
    ['54..665'], // two dots
    ['1,234.56'], // both separators (ambiguous)
    ['54.'], // trailing separator
    ['5.4.3'],
    ['12,'],
  ])('rejects %j', (input) => {
    expect(parseCoordinateInput(input)).toBeNull();
  });
});

describe('parseLatitudeInput', () => {
  it('accepts comma decimals within range', () => {
    expect(parseLatitudeInput('54,66508')).toBeCloseTo(54.66508, 6);
    expect(parseLatitudeInput('-90')).toBe(-90);
    expect(parseLatitudeInput('90')).toBe(90);
  });
  it('rejects out-of-range latitude', () => {
    expect(parseLatitudeInput('91')).toBeNull();
    expect(parseLatitudeInput('-90.0001')).toBeNull();
  });
});

describe('parseLongitudeInput', () => {
  it('accepts comma decimals within range', () => {
    expect(parseLongitudeInput('25,21689')).toBeCloseTo(25.21689, 6);
    expect(parseLongitudeInput('-180')).toBe(-180);
    expect(parseLongitudeInput('180')).toBe(180);
  });
  it('rejects out-of-range longitude', () => {
    expect(parseLongitudeInput('181')).toBeNull();
    expect(parseLongitudeInput('-180.5')).toBeNull();
  });
});

describe('real-world example from the bug report', () => {
  it('accepts 54,66508 / 25,21689', () => {
    expect(parseLatitudeInput('54,66508')).toBeCloseTo(54.66508, 6);
    expect(parseLongitudeInput('25,21689')).toBeCloseTo(25.21689, 6);
  });
});

describe('parseCoordinatePair', () => {
  it.each([
    ['54.66511256770363, 25.216702457750166'], // Google Maps copy
    ['54.66511256770363 25.216702457750166'], // space separated
    ['54.66511,25.21670'], // comma, no space
    ['54,66511, 25,21670'], // comma decimals + comma-space separator
    ['54,66511 25,21670'], // comma decimals + space separator
    ['  54.66511 ,  25.21670  '], // extra/odd spaces
    ['54.66511; 25.21670'], // semicolon separator
    ['(54.66511, 25.21670)'], // surrounding parentheses
    ['-33.8688, 151.2093'], // negative latitude (Sydney)
    ['+54.5, +25.2'], // explicit plus signs
  ])('parses %j', (input) => {
    const r = parseCoordinatePair(input);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(input.includes('-33') ? -33.8688 : input.includes('+54') ? 54.5 : 54.66511, 4);
    expect(r!.lon).toBeGreaterThan(0);
  });

  it('returns latitude first, longitude second', () => {
    expect(parseCoordinatePair('54.6651, 25.2169')).toEqual({ lat: 54.6651, lon: 25.2169 });
  });

  it.each([
    [''],
    ['   '],
    ['54.6651'], // single value
    ['abc, def'],
    ['54,6651,25,2169'], // all-comma, no space -> ambiguous
    ['54.6651, 25.2169, 100'], // three parts
    ['125.0, 25.2'], // latitude out of range
    ['54.6651, 200.0'], // longitude out of range
    ['54..6, 25.2'], // malformed latitude
    ['lat 54.6 lon 25.2'], // labelled / extra tokens
  ])('rejects %j', (input) => {
    expect(parseCoordinatePair(input)).toBeNull();
  });

  it('accepts the exact Google Maps example from the request', () => {
    const r = parseCoordinatePair('54.66511256770363, 25.216702457750166');
    expect(r!.lat).toBeCloseTo(54.66511256770363, 10);
    expect(r!.lon).toBeCloseTo(25.216702457750166, 10);
  });
});
