// Presentation helpers for daylight — the compact strings shown in the Layer-2 strip and the
// banner secondary line. Times are formatted in the FLIGHT-SITE local time (from LocationTime),
// falling back to device-local; every string names the time source.

import type { Daylight } from '../../domain/sun';
import type { LocationTime } from '../../domain/types';
import { fmtTimeInZone, fmtDuration, timeSourceLabel } from '../../utils/time';

const t = (d: Date | null, lt: LocationTime): string => (d ? fmtTimeInZone(d, lt) : '—');

/** Full one-line summary for the Layer-2 DaylightStrip. */
export function daylightStripText(dl: Daylight, lt: LocationTime): string {
  const x = dl.times;
  const zone = timeSourceLabel(lt);
  if (dl.polar === 'day') return `Sun up all day — no sunset today · times ${zone}`;
  if (dl.polar === 'night') return `Polar night — the sun does not rise today · times ${zone}`;

  switch (dl.phase) {
    case 'day': {
      const left = dl.daylightRemainingMin != null ? ` · daylight left ${fmtDuration(dl.daylightRemainingMin)}` : '';
      const golden = x.goldenEveningStart && x.sunset ? ` · golden hour ${t(x.goldenEveningStart, lt)}–${t(x.sunset, lt)}` : '';
      return `Sunrise ${t(x.sunrise, lt)} · sunset ${t(x.sunset, lt)}${left}${golden} · times ${zone}`;
    }
    case 'golden':
      return `Golden hour now · sunset ${t(x.sunset, lt)} · civil dusk ${t(x.civilDusk, lt)} · times ${zone}`;
    case 'civilTwilight':
      return `Civil twilight — light fading · sun set ${t(x.sunset, lt)} · civil dusk ${t(x.civilDusk, lt)} · times ${zone}`;
    case 'night':
      return `Night — little usable light · next sunrise ${t(dl.nextSunrise, lt)} · check daylight rules · times ${zone}`;
  }
}

/** Compact banner secondary line — the at-a-glance daylight status. */
export function daylightBannerLine(dl: Daylight, now: Date, lt: LocationTime): string {
  const x = dl.times;
  if (dl.polar === 'day') return 'Daylight all day — no sunset today';
  if (dl.polar === 'night') return 'Polar night — sun does not rise; check daylight rules';

  switch (dl.phase) {
    case 'day': {
      const left = dl.daylightRemainingMin != null ? `sunset in ${fmtDuration(dl.daylightRemainingMin)}` : `sunset ${t(x.sunset, lt)}`;
      const golden = x.goldenEveningStart && x.goldenEveningStart > now ? ` · golden hour from ${t(x.goldenEveningStart, lt)}` : '';
      return `Daylight OK · ${left}${golden}`;
    }
    case 'golden':
      return dl.daylightRemainingMin != null
        ? `Golden hour now · sunset in ${fmtDuration(dl.daylightRemainingMin)}`
        : `Golden hour now · sunset ${t(x.sunset, lt)}`;
    case 'civilTwilight':
      return 'Civil twilight — light fading; check daylight rules';
    case 'night':
      return `Low light — outside civil daylight · next sunrise ${t(dl.nextSunrise, lt)}`;
  }
}
