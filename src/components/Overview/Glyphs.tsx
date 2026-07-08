// Tiny inline stroke glyphs (Lucide outlines) used inside the dashboard tiles next to numbers.
// Decorative — the adjacent text carries the meaning, so they are aria-hidden. Colored via the
// caller's CSS-module class (theme tokens only).

const PATHS = {
  thermometer: ['M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z'],
  droplet: [
    'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z',
  ],
  // Dew point: a droplet settling on the ground — distinct from the airborne humidity droplet.
  dewpoint: [
    'M12 3.5c-.5 2-1.8 3.4-2.9 4.5A5.6 5.6 0 0 0 7 12a5 5 0 0 0 10 0 5.6 5.6 0 0 0-2.1-4c-1.1-1.1-2.4-2.5-2.9-4.5Z',
    'M5 21h14',
  ],
  // Small rain cloud for the "rain ahead" chip.
  rain: ['M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', 'M8 14v6', 'M16 14v6', 'M12 16v6'],
  // Tiny recognition glyphs for the TAF band chips (thunder / cloud / visibility / gusts).
  bolt: ['m13 2-10 12h8l-2 8 10-12h-8l2-8Z'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  wind: ['M12.8 19.6A2 2 0 1 0 14 16H2', 'M17.5 8a2.5 2.5 0 1 1 2 4H2', 'M9.8 4.4A2 2 0 1 1 11 8H2'],
} as const;

export type GlyphKind = keyof typeof PATHS;

export function Glyph({
  kind,
  className,
  size = 18,
}: {
  kind: GlyphKind;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
