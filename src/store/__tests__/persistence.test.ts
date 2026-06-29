import { describe, it, expect, beforeEach } from 'vitest';
import { useLocationStore } from '../locationStore';
import { useSettingsStore } from '../settingsStore';

beforeEach(() => localStorage.clear());

describe('locationStore persistence (partialize)', () => {
  it('persists only coord/source/selectedIcao and no functions', () => {
    useLocationStore.getState().setCoord({ lat: 54.6651, lon: 25.2169 }, 'pasted');
    const raw = JSON.parse(localStorage.getItem('drone-weather-location')!);
    expect(Object.keys(raw.state).sort()).toEqual(['coord', 'selectedIcao', 'source']);
    expect(raw.state).toEqual({
      coord: { lat: 54.6651, lon: 25.2169 },
      source: 'pasted',
      selectedIcao: null,
    });
  });

  it('keeps a pinned station selection', () => {
    useLocationStore.getState().setSelectedIcao('EYVI');
    const raw = JSON.parse(localStorage.getItem('drone-weather-location')!);
    expect(raw.state.selectedIcao).toBe('EYVI');
  });
});

describe('settingsStore persistence (partialize)', () => {
  it('persists only user preferences', () => {
    useSettingsStore.getState().setWindUnit('kt');
    const raw = JSON.parse(localStorage.getItem('drone-weather-settings')!);
    expect(Object.keys(raw.state).sort()).toEqual(['altUnit', 'opsCeilingM', 'theme', 'windUnit']);
    expect(raw.state.windUnit).toBe('kt');
  });
});
