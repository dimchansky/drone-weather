import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { WindUnit, AltUnit } from '../domain/units';
export type { WindUnit, AltUnit };
export type ThemePref = 'auto' | 'light' | 'dark';

interface SettingsState {
  windUnit: WindUnit;
  altUnit: AltUnit;
  opsCeilingM: number; // operating ceiling for ceiling/icing focus
  theme: ThemePref;
  setWindUnit: (u: WindUnit) => void;
  setAltUnit: (u: AltUnit) => void;
  setOpsCeilingM: (m: number) => void;
  setTheme: (t: ThemePref) => void;
}

function applyTheme(theme: ThemePref): void {
  if (typeof document === 'undefined') return;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      windUnit: 'ms',
      altUnit: 'm',
      opsCeilingM: 120,
      theme: 'auto',
      setWindUnit: (windUnit) => set({ windUnit }),
      setAltUnit: (altUnit) => set({ altUnit }),
      setOpsCeilingM: (opsCeilingM) => set({ opsCeilingM }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'drone-weather-settings',
      // Persist only user preferences (the setters are re-created from the initializer).
      partialize: (s) => ({
        windUnit: s.windUnit,
        altUnit: s.altUnit,
        opsCeilingM: s.opsCeilingM,
        theme: s.theme,
      }),
    },
  ),
);
