// Solar position + daylight events — pure, offline, no dependency. Standard astronomical
// algorithm (Meeus / the one popularised by SunCalc): compute the sun's altitude for a given
// instant and the times it crosses fixed altitude angles (sunrise/sunset, civil twilight, golden
// hour) for a given date + coordinates.
//
// Times are absolute instants (UTC internally); the UI renders them in DEVICE-LOCAL time and says
// so. This is accurate when the pilot is near the flight site (the primary use case); a true
// location-timezone lookup is a documented future enhancement. Isolated here so the algorithm can
// be swapped/improved without touching the UI.

import type { Coord, Severity } from './types';

const rad = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the ecliptic
const J0 = 0.0009;

// Altitude angles (degrees) for the events we surface.
const H_SUNRISE = -0.833; // upper limb + refraction
const H_CIVIL = -6;
const H_GOLDEN = 6;

// ----- Julian date helpers -----
const toJulian = (d: Date): number => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (d: Date): number => toJulian(d) - J2000;

// ----- general sun calculations -----
const solarMeanAnomaly = (d: number): number => rad * (357.5291 + 0.98560028 * d);

const eclipticLongitude = (M: number): number => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
};

const declination = (l: number): number => Math.asin(Math.sin(e) * Math.sin(l)); // ecliptic lat 0 for the sun
const rightAscension = (l: number): number => Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l));
const siderealTime = (d: number, lw: number): number => rad * (280.16 + 360.9856235 * d) - lw;

const altitude = (H: number, phi: number, dec: number): number =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

const azimuth = (H: number, phi: number, dec: number): number =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

function sunCoords(d: number): { dec: number; ra: number } {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L), ra: rightAscension(L) };
}

export interface SunPosition {
  altitudeDeg: number; // degrees above the horizon (negative below)
  azimuthDeg: number; // degrees clockwise from north
}

/** The sun's position (altitude + azimuth) for an instant at a location. */
export function sunPosition(date: Date, coord: Coord): SunPosition {
  const lw = rad * -coord.lon;
  const phi = rad * coord.lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    altitudeDeg: altitude(H, phi, c.dec) / rad,
    azimuthDeg: ((azimuth(H, phi, c.dec) / rad + 180) % 360 + 360) % 360,
  };
}

// ----- event times -----
const julianCycle = (d: number, lw: number): number => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number): number => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number): number =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, dec: number): number =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  civilDawn: Date | null; // sun reaches -6° (morning) — start of civil twilight
  civilDusk: Date | null; // sun descends to -6° (evening) — end of civil twilight
  goldenMorningEnd: Date | null; // sun reaches +6° (morning) — end of the morning golden hour
  goldenEveningStart: Date | null; // sun descends to +6° (evening) — start of the evening golden hour
  solarNoon: Date;
}

/**
 * Sun event times for the day of `date` at a location. A time is null when the sun never reaches
 * that angle (polar day/night, or the sun never gets above +6° for golden hour).
 */
export function sunTimes(date: Date, coord: Coord): SunTimes {
  const lw = rad * -coord.lon;
  const phi = rad * coord.lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);
  const solarNoon = fromJulian(Jnoon);

  const event = (angleDeg: number): { rise: Date | null; set: Date | null } => {
    const Jset = getSetJ(angleDeg * rad, lw, phi, dec, n, M, L);
    if (Number.isNaN(Jset)) return { rise: null, set: null };
    const Jrise = Jnoon - (Jset - Jnoon);
    return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
  };

  const sun = event(H_SUNRISE);
  const civil = event(H_CIVIL);
  const golden = event(H_GOLDEN);

  return {
    sunrise: sun.rise,
    sunset: sun.set,
    civilDawn: civil.rise,
    civilDusk: civil.set,
    goldenMorningEnd: golden.rise,
    goldenEveningStart: golden.set,
    solarNoon,
  };
}

export type DaylightPhase = 'day' | 'golden' | 'civilTwilight' | 'night';

export interface Daylight {
  phase: DaylightPhase;
  altitudeDeg: number;
  times: SunTimes;
  /** Minutes until sunset while the sun is up; null when the sun is down / polar day. */
  daylightRemainingMin: number | null;
  /** The upcoming sunrise (tomorrow's when it's already evening/night); null on polar day. */
  nextSunrise: Date | null;
  /** 'day' = sun never sets today, 'night' = never rises today (polar); null otherwise. */
  polar: 'day' | 'night' | null;
}

/** Current daylight state for a location — phase, remaining daylight, and the event times. */
export function daylight(now: Date, coord: Coord): Daylight {
  const times = sunTimes(now, coord);
  const altitudeDeg = sunPosition(now, coord).altitudeDeg;

  let phase: DaylightPhase;
  if (altitudeDeg >= H_GOLDEN) phase = 'day';
  else if (altitudeDeg >= H_SUNRISE) phase = 'golden';
  else if (altitudeDeg >= H_CIVIL) phase = 'civilTwilight';
  else phase = 'night';

  const polar: 'day' | 'night' | null =
    times.sunrise == null && times.sunset == null ? (altitudeDeg > H_SUNRISE ? 'day' : 'night') : null;

  const sunUp = altitudeDeg > H_SUNRISE;
  const daylightRemainingMin =
    sunUp && times.sunset != null && now < times.sunset
      ? Math.round((times.sunset.getTime() - now.getTime()) / 60000)
      : null;

  // After solar noon and once the sun is heading down/gone, "next sunrise" is tomorrow's.
  let nextSunrise = times.sunrise;
  if (!sunUp && now > times.solarNoon) {
    nextSunrise = sunTimes(new Date(now.getTime() + DAY_MS), coord).sunrise;
  }

  return { phase, altitudeDeg, times, daylightRemainingMin, nextSunrise, polar };
}

/**
 * Daylight as a decision-layer ADVISORY (never a weather severity): daytime/golden hour is fine;
 * civil twilight and night raise CAUTION — low usable light and many jurisdictions require
 * daylight/twilight operation. Darkness never forces NO-FLY here; it is a labelled lighting factor.
 */
export function daylightSeverity(phase: DaylightPhase): Severity {
  return phase === 'day' || phase === 'golden' ? 'GOOD' : 'CAUTION';
}
