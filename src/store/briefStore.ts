import { create } from 'zustand';
import type { Coord, Metar } from '../domain/types';
import { assembleBrief, type Brief, type StationRef } from '../domain/brief';
import { nearestStations, getTaf, type NearbyStation } from '../data/noaa';
import {
  getProfile,
  getSurfaceFallback,
  getModelConditions,
  getForecastWindow,
  getLocationTime,
  type SurfaceFallback,
} from '../data/openMeteo';

const SEARCH_RADIUS_KM = 80;

const isOnline = (): boolean => (typeof navigator !== 'undefined' ? navigator.onLine : true);

/** Build a minimal Metar-shaped object from model surface data (no METAR station nearby). */
function syntheticMetar(s: SurfaceFallback, coord: Coord): Metar {
  const speed = s.windKt ?? 0;
  return {
    icao: 'MODEL',
    station: coord,
    observedAt: s.observedAt,
    ageMin: 0,
    wind: {
      dirDeg: s.windDirDeg,
      variable: s.windDirDeg == null,
      speedKt: speed,
      gustKt: null,
      calm: speed === 0 && s.windDirDeg == null,
    },
    visibilityM: null,
    cavok: false,
    weather: [],
    clouds: [],
    tempC: s.tempC,
    dewpC: s.dewpC,
    qnhHpa: null,
    raw: '(model data — no nearby METAR station)',
  };
}

export type BriefStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LoadOptions {
  selectedIcao?: string | null;
  opsCeilingM?: number;
  /** Bypass the fetch cache and revalidate (Refresh action). */
  force?: boolean;
}

interface BriefState {
  status: BriefStatus;
  brief: Brief | null;
  nearby: NearbyStation[];
  error: string | null;
  offline: boolean;
  load: (coord: Coord, opts?: LoadOptions) => Promise<void>;
}

export const useBriefStore = create<BriefState>((set, get) => ({
  status: 'idle',
  brief: null,
  nearby: [],
  error: null,
  offline: false,

  load: async (coord, opts = {}) => {
    set({ status: 'loading', error: null });
    const now = new Date();
    const force = opts.force;
    try {
      const nearby = await nearestStations(coord, SEARCH_RADIUS_KM, { force });

      if (nearby.length > 0) {
        // Prefer the user's pinned station if it's still in range; else nearest.
        const chosen =
          (opts.selectedIcao && nearby.find((n) => n.metar.icao === opts.selectedIcao)) || nearby[0];
        const [taf, modelLevels, model, forecast, locationTime] = await Promise.all([
          getTaf(chosen.metar.icao, { force }).catch(() => null),
          getProfile(coord, { force }).catch(() => []),
          getModelConditions(coord, { force }).catch(() => null),
          getForecastWindow(coord, { force }).catch(() => []),
          getLocationTime(coord, { force }).catch(() => undefined),
        ]);
        const station: StationRef = {
          icao: chosen.metar.icao,
          name: chosen.metar.stationName,
          coord: chosen.metar.station,
          distanceKm: chosen.distanceKm,
          bearingDeg: chosen.bearingDeg,
        };
        const brief = assembleBrief({
          coord,
          source: 'metar',
          metar: chosen.metar,
          taf,
          modelLevels,
          model,
          forecast,
          locationTime,
          station,
          opsCeilingM: opts.opsCeilingM,
          now,
        });
        set({ status: 'ready', brief, nearby, error: null, offline: !isOnline() });
        return;
      }

      // No nearby METAR station — fall back to a model-only brief.
      const [surface, modelLevels, model, forecast, locationTime] = await Promise.all([
        getSurfaceFallback(coord, { force }),
        getProfile(coord, { force }).catch(() => []),
        getModelConditions(coord, { force }).catch(() => null),
        getForecastWindow(coord, { force }).catch(() => []),
        getLocationTime(coord, { force }).catch(() => undefined),
      ]);
      const brief = assembleBrief({
        coord,
        source: 'model',
        metar: syntheticMetar(surface, coord),
        taf: null,
        modelLevels,
        model,
        forecast,
        locationTime,
        station: null,
        distanceKm: null,
        opsCeilingM: opts.opsCeilingM,
        now,
      });
      set({ status: 'ready', brief, nearby: [], error: null, offline: !isOnline() });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load weather';
      // Keep any previous brief visible rather than blanking the screen.
      set({ status: get().brief ? 'ready' : 'error', error: message, offline: !isOnline() });
    }
  },
}));
