import { create } from 'zustand';
import type { Coord, Metar } from '../domain/types';
import { assembleBrief, type Brief, type StationRef } from '../domain/brief';
import { nearestStations, getTaf, type NearbyStation } from '../data/noaa';
import { getProfile, getSurfaceFallback, type SurfaceFallback } from '../data/openMeteo';

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
    try {
      const nearby = await nearestStations(coord, SEARCH_RADIUS_KM);

      if (nearby.length > 0) {
        const chosen =
          (opts.selectedIcao && nearby.find((n) => n.metar.icao === opts.selectedIcao)) || nearby[0];
        const [taf, modelLevels] = await Promise.all([
          getTaf(chosen.metar.icao).catch(() => null),
          getProfile(coord).catch(() => []),
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
          station,
          opsCeilingM: opts.opsCeilingM,
          now,
        });
        set({ status: 'ready', brief, nearby, error: null, offline: !isOnline() });
        return;
      }

      // No nearby METAR station — fall back to a model-only brief.
      const [surface, modelLevels] = await Promise.all([
        getSurfaceFallback(coord),
        getProfile(coord).catch(() => []),
      ]);
      const brief = assembleBrief({
        coord,
        source: 'model',
        metar: syntheticMetar(surface, coord),
        taf: null,
        modelLevels,
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
