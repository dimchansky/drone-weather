// App header: title + unit/theme controls on one row, a weather-app-style station line
// (station · distance · updated time) when a brief is loaded, and the location actions.
// "Updated" is the FETCH time; the METAR observation age is a different fact and stays in
// StatusStrip.

import type { Brief } from '../../domain/brief';
import { fmtDistance } from '../../utils/format';
import { fmtTimeInZone } from '../../utils/time';
import { LocationBar } from '../Location/LocationBar';
import { SettingsBar } from '../SettingsBar/SettingsBar';
import styles from './AppHeader.module.css';

/**
 * "Vilnius Intl, VL, LT" → "Vilnius Intl" — NOAA station names carry region/country suffixes
 * after commas; the header wants just the airport name (the ICAO next to it disambiguates).
 */
export function stationDisplayName(name: string): string {
  return name.split(',')[0].trim();
}

export function AppHeader({ brief }: { brief: Brief | null }) {
  const updated = brief ? `Updated ${fmtTimeInZone(brief.fetchedAt, brief.locationTime)}` : null;

  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Drone&nbsp;Weather</h1>
        <SettingsBar />
      </div>

      {brief ? (
        <p className={styles.stationLine}>
          {brief.source === 'metar' && brief.station ? (
            <>
              <span className={styles.station}>
                {brief.station.icao}
                {brief.station.name ? ` ${stationDisplayName(brief.station.name)}` : ''}
              </span>
              {' · '}
              {fmtDistance(brief.station.distanceKm)}
              {' · '}
              {updated}
            </>
          ) : (
            <>
              <span className={styles.station}>Model forecast</span>
              {' · no nearby METAR · '}
              {updated}
            </>
          )}
        </p>
      ) : (
        <p className={styles.tagline}>Pre-flight weather decision support</p>
      )}

      <LocationBar />
    </header>
  );
}
