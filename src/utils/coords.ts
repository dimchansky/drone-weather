// Locale-tolerant parsing of manually typed coordinates.
// Accepts a decimal dot OR a decimal comma (many mobile keyboards emit a comma),
// tolerates surrounding spaces, and normalizes to a plain dot-decimal JS number.
// Rejects empty, non-numeric, multi-separator and otherwise malformed input.

/**
 * Parse a possibly locale-formatted decimal string into a number, or `null` if invalid.
 *   "54.66508" -> 54.66508   "54,66508" -> 54.66508   " -25,5 " -> -25.5
 *   "54,66,508" -> null      "54..665" -> null        "abc" / "" -> null
 */
export function parseCoordinateInput(value: string): number | null {
  if (typeof value !== 'string') return null;
  // Normalize a Unicode minus (some keyboards) to ASCII, then trim.
  const trimmed = value.replace(/−/g, '-').trim();
  if (trimmed === '') return null;

  // Allow at most one decimal separator (dot or comma); reject thousands-style or typos.
  const separators = trimmed.match(/[.,]/g) ?? [];
  if (separators.length > 1) return null;

  const normalized = trimmed.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Parse and range-check a latitude (−90…90). */
export function parseLatitudeInput(value: string): number | null {
  const n = parseCoordinateInput(value);
  return n != null && n >= -90 && n <= 90 ? n : null;
}

/** Parse and range-check a longitude (−180…180). */
export function parseLongitudeInput(value: string): number | null {
  const n = parseCoordinateInput(value);
  return n != null && n >= -180 && n <= 180 ? n : null;
}

// Candidate lat/lon separators, tried in priority order. A dot-decimal string lets the
// comma act as the separator; a comma-decimal string is only unambiguous when the
// separator is a comma+space, a space, or a semicolon. All-comma, no-space strings
// (e.g. "54,6651,25,2169") are ambiguous and rejected.
const PAIR_SEPARATORS: RegExp[] = [/\s*;\s*/, /,\s+/, /\s+/, /,/];

/**
 * Parse a pasted "latitude, longitude" pair (Google Maps style) into numbers, or `null`.
 * Latitude comes first. Accepts dot or comma decimals where unambiguous, extra spaces,
 * and surrounding parentheses/brackets/degree signs. Rejects ambiguous or malformed input.
 *   "54.66511, 25.21670" · "54.66511 25.21670" · "54,66511, 25,21670" · "(54.6, 25.2)"
 */
export function parseCoordinatePair(value: string): { lat: number; lon: number } | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .trim()
    .replace(/^[([]+|[)\]]+$/g, '')
    .replace(/°/g, '')
    .trim();
  if (cleaned === '') return null;

  for (const sep of PAIR_SEPARATORS) {
    const parts = cleaned
      .split(sep)
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (parts.length !== 2) continue;
    const lat = parseLatitudeInput(parts[0]);
    const lon = parseLongitudeInput(parts[1]);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}
