import { useEffect } from 'react';
import { useLocationStore } from '../store/locationStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBriefStore } from '../store/briefStore';

/** Loads (and reloads) the weather brief whenever location, station or ops ceiling change. */
export function useBriefLoader(): void {
  const coord = useLocationStore((s) => s.coord);
  const selectedIcao = useLocationStore((s) => s.selectedIcao);
  const opsCeilingM = useSettingsStore((s) => s.opsCeilingM);
  const load = useBriefStore((s) => s.load);

  useEffect(() => {
    if (coord) void load(coord, { selectedIcao, opsCeilingM });
  }, [coord?.lat, coord?.lon, selectedIcao, opsCeilingM, load]);
}
