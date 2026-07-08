import { useMemo } from 'react';
import styles from './App.module.css';
import { useBriefLoader } from './hooks/useBriefLoader';
import { useNow } from './hooks/useNow';
import { assessRisk } from './domain/risk';
import { icingBand } from './domain/icing';
import { opsBandHazard } from './domain/vertical';
import { daylight, daylightSeverity } from './domain/sun';
import { summarizeForecast } from './domain/forecast';
import { parseTaf, summarizeTaf } from './domain/taf';
import { useBriefStore } from './store/briefStore';
import { useLocationStore } from './store/locationStore';
import { useSettingsStore } from './store/settingsStore';
import { AppHeader } from './components/Header/AppHeader';
import { OverviewGrid } from './components/Overview/OverviewGrid';
import { ForecastTimelineCard } from './components/Timeline/ForecastTimelineCard';
import { DecisionBanner } from './components/Risk/DecisionBanner';
import { RiskFactors } from './components/Risk/RiskFactors';
import { StatusStrip } from './components/Status/StatusStrip';
import { daylightBannerLine } from './components/Daylight/daylightText';
import { TafDetailsCard } from './components/Taf/TafDetailsCard';
import type { SecondaryLine } from './components/Risk/DecisionBanner';
import { StationCard } from './components/Station/StationCard';
import { VerticalAnalyzer } from './components/Vertical/VerticalAnalyzer';
import { VerticalHazardStrip } from './components/Vertical/VerticalHazardStrip';
import { CloudsCard } from './components/Clouds/CloudsCard';
import { RawData } from './components/Raw/RawData';
import { ReloadPrompt } from './components/ReloadPrompt/ReloadPrompt';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export function App() {
  useBriefLoader();
  const coord = useLocationStore((s) => s.coord);
  const { status, brief, error, offline } = useBriefStore();

  // Tick the clock so age/freshness stay live while the app is open.
  const now = useNow(30000);
  const windUnit = useSettingsStore((s) => s.windUnit);
  const altUnit = useSettingsStore((s) => s.altUnit);
  // Recompute risk (a pure, no-network op) when the brief, clock, or unit prefs change so wind &
  // altitude values render in the selected units without re-fetching weather. The icing reason
  // carries altitudes, so it is re-derived here too (icingBand is pure; the bands are unchanged).
  const liveRisk = useMemo(() => {
    if (!brief) return null;
    const icing = icingBand(brief.profile, brief.metar, altUnit);
    return assessRisk({
      metar: brief.metar,
      icingWorst: icing.worst,
      icingReason: icing.reason,
      distanceKm: brief.station?.distanceKm ?? null,
      opsCeilingM: brief.opsCeilingM,
      model: brief.model,
      cloudBaseM: brief.cloudBase.baseM,
      profile: brief.profile,
      source: brief.source,
      windUnit,
      altUnit,
      now,
    });
  }, [brief, now, windUnit, altUnit]);

  // Daylight for the flight location (pure, offline). Recomputes on the clock tick so the phase,
  // remaining daylight, and golden-hour window stay live. Times are rendered device-local.
  const dl = useMemo(() => (brief ? daylight(now, brief.coord) : null), [brief, now]);

  // Short-term model forecast summary (pure). Recomputes on the clock tick so "rain in ~X min"
  // stays live; wind values are formatted per unit in the strip/note.
  const fc = useMemo(() => (brief ? summarizeForecast(now, brief.forecast) : null), [brief, now]);

  // TAF (aviation airport forecast) — parse once, then derive the near-term summary. Advisory:
  // kept separate from the Open-Meteo point forecast; never changes the verdict.
  const tafParsed = useMemo(() => {
    if (!brief?.taf) return null;
    const ref = brief.taf.validFrom ?? brief.taf.issuedAt ?? now;
    return parseTaf(brief.taf.raw, { reference: ref });
  }, [brief, now]);
  const taf = useMemo(() => (tafParsed ? summarizeTaf(tafParsed, now) : null), [tafParsed, now]);

  // Banner secondary lines, trimmed since the forecast timeline sits directly below the banner:
  // daylight only when it is an operational concern (twilight/night); model/TAF forecast notes
  // moved into the timeline's lanes (their hazards stay visible one glance lower).
  const secondary: SecondaryLine[] = [];
  if (dl && brief && daylightSeverity(dl.phase) === 'CAUTION') {
    secondary.push({ text: daylightBannerLine(dl, now, brief.locationTime), severity: 'CAUTION' });
  }

  return (
    <div className={styles.app}>
      <AppHeader brief={brief} />

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

            {/* Visual dashboard — the plain "what's the weather" answer; decision layers follow */}
            {dl && <OverviewGrid brief={brief} daylight={dl} forecast={fc} now={now} />}

            {/* Layer 1 — the decision */}
            <DecisionBanner risk={liveRisk ?? brief.risk} wind={brief.metar.wind} secondary={secondary} />

            {/* Visual forecast timeline — model lane + TAF band, source-labelled */}
            <ForecastTimelineCard brief={brief} taf={tafParsed} now={now} />

            {/* Layer 2 — decision support (compact, always visible).
                PrecipNowPill / ForecastStrip / TafStrip / ThermoCard are retired from the page:
                the Now tile + timeline lanes carry their facts (components stay in-tree). */}
            <StatusStrip brief={brief} now={now} />
            <RiskFactors risk={liveRisk ?? brief.risk} />
            <VerticalHazardStrip
              hazard={opsBandHazard(
                brief.icing.levels,
                brief.cloudBase.baseM,
                brief.opsCeilingM,
                altUnit,
              )}
            />

            {/* Layer 3 — technical detail (collapsed by default) */}
            <VerticalAnalyzer brief={brief} />
            <CloudsCard brief={brief} />
            <StationCard brief={brief} now={now} />
            <TafDetailsCard
              taf={tafParsed}
              summary={taf}
              windUnit={windUnit}
              altUnit={altUnit}
              locationTime={brief.locationTime}
            />
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
