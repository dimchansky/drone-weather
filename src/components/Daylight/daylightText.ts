// Presentation helpers for daylight — the compact strings shown in the Layer-2 strip and the
// banner secondary line. Kept pure (times in, string out) so they are unit-testable. Times are
// formatted in DEVICE-LOCAL time and every string says so.

import type { Daylight } from '../../domain/sun';
import { fmtLocalTime, fmtDuration } from '../../utils/time';

const t = (d: Date | null): string => (d ? fmtLocalTime(d) : '—');

/** Full one-line summary for the Layer-2 DaylightStrip. */
export function daylightStripText(dl: Daylight): string {
  const x = dl.times;
  if (dl.polar === 'day') return 'Sun up all day — no sunset today · times device-local';
  if (dl.polar === 'night') return 'Polar night — the sun does not rise today · times device-local';

  switch (dl.phase) {
    case 'day': {
      const left = dl.daylightRemainingMin != null ? ` · daylight left ${fmtDuration(dl.daylightRemainingMin)}` : '';
      const golden = x.goldenEveningStart && x.sunset ? ` · golden hour ${t(x.goldenEveningStart)}–${t(x.sunset)}` : '';
      return `Sunrise ${t(x.sunrise)} · sunset ${t(x.sunset)}${left}${golden} · times device-local`;
    }
    case 'golden':
      return `Golden hour now · sunset ${t(x.sunset)} · civil dusk ${t(x.civilDusk)} · times device-local`;
    case 'civilTwilight':
      return `Civil twilight — light fading · sun set ${t(x.sunset)} · civil dusk ${t(x.civilDusk)} · times device-local`;
    case 'night':
      return `Night — little usable light · next sunrise ${t(dl.nextSunrise)} · check daylight rules · times device-local`;
  }
}

/** Compact banner secondary line — the at-a-glance daylight status. */
export function daylightBannerLine(dl: Daylight, now: Date): string {
  const x = dl.times;
  if (dl.polar === 'day') return 'Daylight all day — no sunset today';
  if (dl.polar === 'night') return 'Polar night — sun does not rise; check daylight rules';

  switch (dl.phase) {
    case 'day': {
      const left = dl.daylightRemainingMin != null ? `sunset in ${fmtDuration(dl.daylightRemainingMin)}` : `sunset ${t(x.sunset)}`;
      const golden = x.goldenEveningStart && x.goldenEveningStart > now ? ` · golden hour from ${t(x.goldenEveningStart)}` : '';
      return `Daylight OK · ${left}${golden}`;
    }
    case 'golden':
      return dl.daylightRemainingMin != null
        ? `Golden hour now · sunset in ${fmtDuration(dl.daylightRemainingMin)}`
        : `Golden hour now · sunset ${t(x.sunset)}`;
    case 'civilTwilight':
      return 'Civil twilight — light fading; check daylight rules';
    case 'night':
      return `Low light — outside civil daylight · next sunrise ${t(dl.nextSunrise)}`;
  }
}
