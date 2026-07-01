import type { Daylight } from '../../domain/sun';
import { daylightSeverity } from '../../domain/sun';
import { InfoStrip } from '../common/InfoStrip';
import { daylightStripText } from './daylightText';

/**
 * Layer 2 — daylight/sun/twilight/golden-hour at a glance. Colored by the daylight advisory
 * (CAUTION in twilight/night, never NO-FLY). Times are device-local, stated in the text.
 */
export function DaylightStrip({ daylight }: { daylight: Daylight }) {
  return (
    <InfoStrip
      severity={daylightSeverity(daylight.phase)}
      title="Daylight — times shown in device local time"
    >
      {daylightStripText(daylight)}
    </InfoStrip>
  );
}
