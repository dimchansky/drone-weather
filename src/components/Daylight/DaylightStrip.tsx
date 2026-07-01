import type { Daylight } from '../../domain/sun';
import { daylightSeverity } from '../../domain/sun';
import type { LocationTime } from '../../domain/types';
import { timeSourceLabel } from '../../utils/time';
import { InfoStrip } from '../common/InfoStrip';
import { daylightStripText } from './daylightText';

/**
 * Layer 2 — daylight/sun/twilight/golden-hour at a glance. Colored by the daylight advisory
 * (CAUTION in twilight/night, never NO-FLY). Times are the flight-site local time (or device-local
 * fallback), stated in the text.
 */
export function DaylightStrip({ daylight, locationTime }: { daylight: Daylight; locationTime: LocationTime }) {
  return (
    <InfoStrip
      severity={daylightSeverity(daylight.phase)}
      title={`Daylight — times shown in ${timeSourceLabel(locationTime)}`}
    >
      {daylightStripText(daylight, locationTime)}
    </InfoStrip>
  );
}
