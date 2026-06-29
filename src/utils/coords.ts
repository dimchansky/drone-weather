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
