// Brief assembler — pure composition of the domain pieces into the object the UI renders.
// The async fetching lives in the store; this stays pure and testable. See docs/spec.md §7.

import type { Coord, Metar, ModelConditions, ProfileLevel, RiskSummary, Taf, VerticalProfile } from './types';
import { mergeModelProfile, lapseProfile } from './profile';
import { icingBand, type IcingBand } from './icing';
import { resolveCloudBase, type ResolvedCloudBase } from './clouds';
import { assessRisk, DEFAULT_OPS_CEILING_M } from './risk';

export interface StationRef {
  icao: string;
  name?: string;
  coord: Coord;
  distanceKm: number;
  bearingDeg: number;
}

export interface Brief {
  coord: Coord;
  source: 'metar' | 'model'; // metar = real observation; model = Open-Meteo fallback
  station: StationRef | null;
  metar: Metar; // real, or synthesized from model surface data
  taf: Taf | null;
  profile: VerticalProfile;
  icing: IcingBand;
  cloudBase: ResolvedCloudBase;
  risk: RiskSummary;
  model: ModelConditions | null; // kept so risk can be recomputed live (freshness + dew)
  opsCeilingM: number; // kept so the risk can be recomputed live (freshness)
  fetchedAt: Date;
}

export interface AssembleInput {
  coord: Coord;
  source: 'metar' | 'model';
  metar: Metar;
  taf?: Taf | null;
  modelLevels: ProfileLevel[];
  model?: ModelConditions | null;
  station?: StationRef | null;
  distanceKm?: number | null;
  opsCeilingM?: number;
  now?: Date;
}

export function assembleBrief(input: AssembleInput): Brief {
  const now = input.now ?? new Date();
  const opsCeilingM = input.opsCeilingM ?? DEFAULT_OPS_CEILING_M;

  // Prefer real modeled upper-air data; fall back to the naive lapse model.
  const profile: VerticalProfile =
    input.modelLevels.length >= 2
      ? mergeModelProfile(input.modelLevels)
      : lapseProfile(input.metar.tempC ?? 15);

  const icing = icingBand(profile, input.metar);
  const cloudBase = resolveCloudBase(input.metar, profile);
  const model = input.model ?? null;
  const risk = assessRisk({
    metar: input.metar,
    icingWorst: icing.worst,
    icingReason: icing.reason,
    distanceKm: input.distanceKm ?? input.station?.distanceKm ?? null,
    opsCeilingM,
    model,
    cloudBaseM: cloudBase.baseM,
    profile,
    source: input.source,
    now,
  });

  return {
    coord: input.coord,
    source: input.source,
    station: input.station ?? null,
    metar: input.metar,
    taf: input.taf ?? null,
    profile,
    icing,
    cloudBase,
    risk,
    model,
    opsCeilingM,
    fetchedAt: now,
  };
}
