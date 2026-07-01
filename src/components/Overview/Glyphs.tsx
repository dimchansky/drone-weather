// Tiny inline stroke glyphs (Lucide outlines) used inside the dashboard tiles next to numbers.
// Decorative — the adjacent text carries the meaning, so they are aria-hidden. Colored via the
// caller's CSS-module class (theme tokens only).

const PATHS = {
  thermometer: ['M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z'],
  droplet: [
    'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z',
  ],
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
