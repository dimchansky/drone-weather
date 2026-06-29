// Range-aware tick/label selection for the vertical hazard analyzer.
// The coloured bands still use every profile level; only the *labelled* altitudes are reduced
// so the 0–1000 m view doesn't cram the low-altitude labels together.

const LOW_TICKS = [0, 30, 50, 100, 150]; // drone-relevant detail (120 m ops drawn separately)
const HIGH_TICKS = [0, 100, 300, 500, 1000];

/** Altitudes (m AGL) that get an axis + temperature label for the given view range. */
export function altitudeTicks(maxAltM: number): number[] {
  return (maxAltM <= 150 ? LOW_TICKS : HIGH_TICKS).filter((a) => a <= maxAltM);
}
