// Research fetcher (Node ESM, no build step). Captures a climate/timezone-diverse sample of
// real METARs + matching Open-Meteo vertical profiles, and writes raw JSON fixtures so the
// cloud-base analysis is reproducible. Run:  node research/cloud-base/fetch.mjs
//
// NOT production code. Lives under research/ and is never imported by the app.
//
// Why a flat .mjs and not the TS domain modules: the fetch step needs no domain logic — it
// just snapshots upstream responses. The analysis step (cloudBase.research.test.ts) reuses the
// real domain code against these fixtures.

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

// Diverse by climate AND local time-of-day (it is ~08:00Z at capture, so timezones spread the
// sample across night/morning/afternoon/evening). Labels are a-priori expectations, not truth.
const STATIONS = [
  // Marine layer / coastal stratus (US West — night→early morning at 08Z)
  ['KSFO', 'marine-layer coastal, night'],
  ['KMRY', 'Monterey marine layer'],
  ['KSMX', 'Santa Maria coastal'],
  ['KACV', 'Arcata foggy coast'],
  // NW Europe maritime (morning; frequent low stratus / drizzle)
  ['EGLL', 'London Heathrow, morning'],
  ['EHAM', 'Amsterdam, morning'],
  ['EIDW', 'Dublin maritime'],
  ['EGPF', 'Glasgow maritime'],
  ['EKCH', 'Copenhagen'],
  ['ENGM', 'Oslo'],
  ['BIKF', 'Keflavik (cold, often low cloud)'],
  // Dry / desert (clear, large spread) — afternoon
  ['OMDB', 'Dubai desert, afternoon'],
  ['OERK', 'Riyadh desert'],
  ['OEJN', 'Jeddah coastal desert'],
  ['KPHX', 'Phoenix desert (night)'],
  ['LLBG', 'Tel Aviv'],
  // Tropical humid — afternoon/evening
  ['WSSS', 'Singapore humid, evening'],
  ['VTBS', 'Bangkok humid'],
  ['RPLL', 'Manila humid'],
  ['VABB', 'Mumbai monsoon'],
  // Mediterranean (often CAVOK) — late morning
  ['LGAV', 'Athens'],
  ['LEMD', 'Madrid'],
  ['LIRF', 'Rome'],
  ['LCLK', 'Larnaca'],
  // High elevation (AGL vs ASL / elevation-subtraction stress test)
  ['KDEN', 'Denver ~1655 m'],
  ['SLLP', 'La Paz ~4000 m'],
  ['FAOR', 'Johannesburg ~1700 m'],
  ['KABQ', 'Albuquerque ~1620 m'],
  // Asia — evening
  ['RJTT', 'Tokyo Haneda, evening'],
  ['RKSI', 'Seoul Incheon'],
  ['ZBAA', 'Beijing'],
  ['VHHH', 'Hong Kong humid'],
  // Continental US — early morning
  ['KORD', 'Chicago'],
  ['KMCI', 'Kansas City (app default area)'],
  ['KATL', 'Atlanta'],
  // Southern hemisphere — evening/night
  ['SBGR', 'Sao Paulo'],
  ['SAEZ', 'Buenos Aires'],
  ['YSSY', 'Sydney'],
  ['NZAA', 'Auckland maritime'],
];

// Per-level vars. 975 hPa (~300 m) is added vs the app (which skips it) so the analysis can
// measure how much low-band resolution it buys. 800/700 give upper context.
const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700];
const SURFACE_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'precipitation',
  'precipitation_probability',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
];
const PER_LEVEL = (l) => [
  `temperature_${l}hPa`,
  `relative_humidity_${l}hPa`,
  `geopotential_height_${l}hPa`,
  `cloud_cover_${l}hPa`,
  `wind_speed_${l}hPa`,
  `wind_direction_${l}hPa`,
];
const HOURLY = [...SURFACE_VARS, ...LEVELS.flatMap(PER_LEVEL)].join(',');

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'drone-weather-research/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.slice(0, 80)}…`);
  return r.json();
}

async function main() {
  await mkdir(FIXTURES, { recursive: true });
  const ids = STATIONS.map(([icao]) => icao);

  // 1) One multi-id METAR call → raw + coords + elevation + decoded clouds + obsTime.
  console.log(`Fetching ${ids.length} METARs in one call…`);
  const metars = await getJson(
    `https://aviationweather.gov/api/data/metar?ids=${ids.join(',')}&format=json`,
  );
  const byId = new Map();
  for (const m of metars) byId.set(m.icaoId, m);

  const manifest = { capturedAt: new Date().toISOString(), stations: [] };

  // 2) Per-station Open-Meteo profile at the station's coords (sequential, polite).
  for (const [icao, label] of STATIONS) {
    const m = byId.get(icao);
    if (!m || m.lat == null || m.lon == null) {
      console.warn(`  ${icao}: no METAR/coords — skipped`);
      continue;
    }
    try {
      const om = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${m.lat}&longitude=${m.lon}` +
          `&hourly=${HOURLY}&wind_speed_unit=kn&forecast_days=1&past_days=1&timezone=GMT`,
      );
      const fixture = { icao, label, capturedAt: manifest.capturedAt, metar: m, om };
      await writeFile(join(FIXTURES, `${icao}.json`), JSON.stringify(fixture, null, 2));
      manifest.stations.push({ icao, label, raw: m.rawOb });
      console.log(`  ${icao.padEnd(5)} ok  ${m.rawOb}`);
    } catch (e) {
      console.warn(`  ${icao}: open-meteo failed — ${e.message}`);
    }
  }

  await writeFile(join(FIXTURES, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.stations.length} fixtures + manifest.json to ${FIXTURES}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
