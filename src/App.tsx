import { useMemo } from 'react';
import styles from './App.module.css';
import { useBriefLoader } from './hooks/useBriefLoader';
import { useNow } from './hooks/useNow';
import { assessRisk } from './domain/risk';
import { useBriefStore } from './store/briefStore';
import { useLocationStore } from './store/locationStore';
import { LocationBar } from './components/Location/LocationBar';
import { SettingsBar } from './components/SettingsBar/SettingsBar';
import { RiskSummary } from './components/Risk/RiskSummary';
import { WindCompass } from './components/Wind/WindCompass';
import { StationCard } from './components/Station/StationCard';
import { VerticalAnalyzer } from './components/Vertical/VerticalAnalyzer';
import { CloudsCard } from './components/Clouds/CloudsCard';
import { ThermoCard } from './components/Thermo/ThermoCard';
import { RawData } from './components/Raw/RawData';
import { ReloadPrompt } from './components/ReloadPrompt/ReloadPrompt';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export function App() {
  useBriefLoader();
  const coord = useLocationStore((s) => s.coord);
  const { status, brief, error, offline } = useBriefStore();

  // Tick the clock so age/freshness stay live while the app is open.
  const now = useNow(30000);
  const liveRisk = useMemo(
    () =>
      brief
        ? assessRisk({
            metar: brief.metar,
            icingWorst: brief.icing.worst,
            icingReason: brief.icing.reason,
            distanceKm: brief.station?.distanceKm ?? null,
            opsCeilingM: brief.opsCeilingM,
            model: brief.model,
            cloudBaseM: brief.cloudBase.baseM,
            now,
          })
        : null,
    [brief, now],
  );

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Drone&nbsp;Weather</h1>
        <p className={styles.tagline}>Pre-flight weather decision support</p>
      </header>

      <LocationBar />
      <SettingsBar />

      <main className={styles.main}>
        {!coord && (
          <div className={styles.placeholder}>
            <p>Set your location to get a pre-flight weather brief for your flight site.</p>
          </div>
        )}

        {coord && status === 'loading' && !brief && (
          <div className={styles.placeholder}>
            <p>Fetching the nearest station and weather…</p>
          </div>
        )}

        {coord && status === 'error' && !brief && (
          <div className={styles.errorBox} role="alert">
            <p>Couldn’t load weather: {error}</p>
            <p className={styles.dim}>Check your connection and try your location again.</p>
          </div>
        )}

        {brief && (
          <>
            {offline && (
              <div className={styles.banner}>Offline — showing the last data that loaded.</div>
            )}
            {error && (
              <div className={styles.banner}>Couldn’t refresh ({error}); showing last data.</div>
            )}

            <RiskSummary risk={liveRisk ?? brief.risk} observedAt={brief.metar.observedAt} />
            <WindCompass wind={brief.metar.wind} />
            <StationCard brief={brief} now={now} />
            <VerticalAnalyzer brief={brief} />
            <CloudsCard brief={brief} />
            <ThermoCard metar={brief.metar} />
            <RawData brief={brief} />
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>
          <strong>Decision support only — not a legal flight authorization.</strong> Always verify
          the raw METAR, apply your own aircraft limits, and check local regulations, airspace, and
          NOTAMs before flying.
        </p>
        <p className={styles.version}>build {VERSION}</p>
      </footer>

      <ReloadPrompt />
    </div>
  );
}
