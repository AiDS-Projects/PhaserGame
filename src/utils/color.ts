// Color utility helpers shared across scenes and the level renderer.
//
// Phaser accepts colors in different forms depending on the API: CSS strings
// ('#RRGGBB', 'rgba(...)') for rectangles/sprites, and numeric 0xRRGGBB
// integers for tints and Graphics.fillStyle. These helpers keep that
// conversion in one place instead of scattering it across call sites.
//
// The palette tokens themselves live in constants.ts (COLORS) and
// levelBuilder.ts (LEVEL_COLORS); this module is pure conversion/validation
// logic with no dependency on those tokens.

/** CSS hex color in the form '#RRGGBB' (no alpha channel). */
export type HexColor = `#${string}`;

/**
 * Type guard for validating hex colors from external sources (API responses,
 * localStorage, etc.). Rejects anything that is not a 6-digit hex string.
 */
export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Convert '#RRGGBB' to Phaser's 0xRRGGBB integer. */
export function hexToNumber(hex: HexColor): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * Convert '#RRGGBB' to an 'rgba(r, g, b, a)' CSS string with `alpha` clamped
 * to the [0, 1] range.
 */
export function withAlpha(hex: HexColor, alpha: number): string {
  const n = hexToNumber(hex);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}