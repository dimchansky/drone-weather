// Sunrise→sunset progress for the Daylight tile's sun-arc visual. Pure helper, kept out of the
// component so it is unit-testable without rendering.

/**
 * Fraction of the daylight window elapsed at `now`, clamped to 0..1.
 * Null when either time is missing (polar day/night) or `now` is outside [sunrise, sunset] —
 * the tile then renders its night state instead of a sun marker.
 */
export function sunArcProgress(
  now: Date,
  sunrise: Date | null,
  sunset: Date | null,
): number | null {
  if (!sunrise || !sunset) return null;
  const span = sunset.getTime() - sunrise.getTime();
  if (span <= 0) return null;
  const t = now.getTime();
  if (t < sunrise.getTime() || t > sunset.getTime()) return null;
  return (t - sunrise.getTime()) / span;
}
