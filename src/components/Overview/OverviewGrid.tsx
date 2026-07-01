// The visual dashboard: four compact squarish tiles answering the plain-weather questions
// (what's outside, how warm/wet, which way is the wind, how much light is left) above the
// drone decision layers. Display-only — every fact comes from existing domain helpers.

import type { Brief } from '../../domain/brief';
import type { Daylight } from '../../domain/sun';
import { CurrentWeatherTile } from './CurrentWeatherTile';
import { ThermoTile } from './ThermoTile';
import { WindTile } from './WindTile';
import { DaylightTile } from './DaylightTile';
import styles from './OverviewGrid.module.css';

export function OverviewGrid({
  brief,
  daylight,
  now,
}: {
  brief: Brief;
  daylight: Daylight;
  now: Date;
}) {
  return (
    <section className={styles.grid} aria-label="Weather overview">
      <CurrentWeatherTile brief={brief} phase={daylight.phase} />
      <ThermoTile metar={brief.metar} model={brief.model} />
      <WindTile wind={brief.metar.wind} />
      <DaylightTile daylight={daylight} locationTime={brief.locationTime} now={now} />
    </section>
  );
}
