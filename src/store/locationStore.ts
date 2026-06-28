import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Coord } from '../domain/types';

export type LocationSource = 'gps' | 'manual';

interface LocationState {
  coord: Coord | null;
  source: LocationSource | null;
  /** ICAO the user manually pinned; null = auto-pick nearest. */
  selectedIcao: string | null;
  setCoord: (coord: Coord, source: LocationSource) => void;
  setSelectedIcao: (icao: string | null) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      coord: null,
      source: null,
      selectedIcao: null,
      // A new location resets the station selection so we re-pick the nearest.
      setCoord: (coord, source) => set({ coord, source, selectedIcao: null }),
      setSelectedIcao: (selectedIcao) => set({ selectedIcao }),
    }),
    { name: 'drone-weather-location' },
  ),
);
