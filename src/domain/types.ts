// Domain types — pure data shapes shared across the app.
// See docs/spec.md §3 for the full rationale.

// ----- units & geo -----
export type Coord = { lat: number; lon: number }; // degrees

// ----- METAR -----
export type CloudCover =
  | 'FEW'
  | 'SCT'
  | 'BKN'
  | 'OVC'
  | 'VV'
  | 'NSC'
  | 'NCD'
  | 'SKC'
  | 'CLR';

export interface CloudLayer {
  cover: CloudCover;
  baseFt: number | null; // ft AGL (null for VV-unknown or sky-clear codes)
  baseM: number | null; // derived from baseFt
  cb: boolean; // cumulonimbus
  tcu: boolean; // towering cumulus
}

export interface Wind {
  dirDeg: number | null; // direction the wind comes FROM; null when variable (VRB)
  variable: boolean; // VRB, or a variable sector is present
  varFromDeg?: number; // e.g. 280V350 -> 280
  varToDeg?: number; // e.g. 280V350 -> 350
  speedKt: number;
  gustKt: number | null;
  calm: boolean;
}

export interface Weather {
  raw: string;
  intensity: '-' | '+' | '';
  descriptor?: string;
  phenomena: string[];
}

export interface Metar {
  icao: string;
  stationName?: string;
  station: Coord;
  elevationM?: number;
  observedAt: Date;
  ageMin: number; // derived at read time
  wind: Wind;
  visibilityM: number | null; // metres; '10+'/9999/P6SM -> 10000 (>=10km)
  cavok: boolean;
  weather: Weather[];
  clouds: CloudLayer[];
  tempC: number | null;
  dewpC: number | null;
  qnhHpa: number | null;
  trend?: string; // NOSIG, etc.
  raw: string; // rawOb — ALWAYS preserved for verification
}

export interface Taf {
  icao: string;
  issuedAt: Date;
  validFrom: Date;
  validTo: Date;
  raw: string;
}

// ----- vertical profile -----
export type ProfileSource = 'model' | 'lapse';

export interface ProfileLevel {
  altM: number; // AGL
  tempC: number;
  dewpC: number | null; // populated only from model data (Open-Meteo)
  rhPct: number | null;
  windDirDeg?: number | null;
  windKt?: number | null;
  cloudPct?: number | null;
  source: ProfileSource;
}

export interface VerticalProfile {
  levels: ProfileLevel[];
  source: ProfileSource;
  note: string;
}

/** One hour of the short-term model forecast look-ahead window (Open-Meteo). */
export interface ForecastHour {
  time: Date;
  windKt: number | null;
  gustKt: number | null;
  precipMm: number | null;
  precipProb: number | null; // %
}

/** Surface-level model (Open-Meteo) conditions used for moisture/wetness risk. */
export interface ModelConditions {
  tempC2m: number | null;
  dewp2m: number | null;
  rh2m: number | null;
  windKt: number | null;
  precipMm: number | null;
  precipProb: number | null; // %
  cloudCoverPct: number | null; // total cloud cover %
  cloudCoverLowPct: number | null; // low cloud cover %
}

// ----- risk -----
export type Severity = 'GOOD' | 'CAUTION' | 'HIGH' | 'NOFLY';
export type Confidence = 'OK' | 'REDUCED' | 'LOW';

export interface RiskComponent {
  key: string;
  label: string;
  severity: Severity;
  reason: string;
  value?: string;
}

export interface RiskSummary {
  overall: Severity;
  confidence: Confidence;
  components: RiskComponent[];
  headline: string;
  uncertain: boolean;
  /** Single dominant weather driver (worst severity, priority-ordered); null when GOOD. */
  primary: RiskComponent | null;
  /** Short, hedged pilot advice keyed off the primary driver. Never asserts "safe to fly". */
  advice: string;
}
