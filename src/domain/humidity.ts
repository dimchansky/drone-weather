// Humidity relationships via the Magnus-Tetens approximation.
// Constants per WMO / Alduchov & Eskridge (1996): a = 17.625, b = 243.04 °C.
// See docs/spec.md §4.4 and docs/initial-idea.md §7.4.

const A = 17.625;
const B = 243.04;

/** Dew point (°C) from temperature (°C) and relative humidity (%). */
export function dewPointFromRH(tempC: number, rhPct: number): number {
  const clamped = Math.min(100, Math.max(0.01, rhPct)); // avoid log(0)
  const gamma = Math.log(clamped / 100) + (A * tempC) / (B + tempC);
  return (B * gamma) / (A - gamma);
}

/** Relative humidity (%) from temperature (°C) and dew point (°C). */
export function rhFromDewPoint(tempC: number, dewpC: number): number {
  const rh =
    100 * Math.exp((A * dewpC) / (B + dewpC) - (A * tempC) / (B + tempC));
  return Math.min(100, Math.max(0, rh));
}

/** Dew point spread (°C): temperature minus dew point. Larger = drier air. */
export function dewPointSpread(tempC: number, dewpC: number): number {
  return tempC - dewpC;
}
