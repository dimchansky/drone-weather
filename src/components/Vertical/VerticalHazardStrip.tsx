import type { VerticalHazard } from '../../domain/vertical';
import { InfoStrip } from '../common/InfoStrip';

/**
 * Layer 2 — the ops-band vertical conclusion, always visible so the app's unique vertical signal
 * isn't lost when the full analyzer chart is collapsed below it in Layer 3.
 */
export function VerticalHazardStrip({ hazard }: { hazard: VerticalHazard }) {
  return (
    <InfoStrip severity={hazard.severity} title="Vertical hazard (ops band)">
      {hazard.text}
    </InfoStrip>
  );
}
