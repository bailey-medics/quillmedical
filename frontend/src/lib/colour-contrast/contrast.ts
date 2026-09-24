/**
 * WCAG 2.2 colour contrast.
 *
 * The ratio between two opaque sRGB colours, as success criterion 1.4.3
 * defines it: (lighter + 0.05) / (darker + 0.05) over relative luminance.
 * Used by the theme tests to hold every text token to AA, so a colour
 * change that would fail axe fails the unit tests first.
 */

/** WCAG AA minimum for body text (1.4.3). */
export const AA_TEXT = 4.5;

/** WCAG AA minimum for large text and for graphics (1.4.3, 1.4.11). */
export const AA_LARGE_OR_GRAPHIC = 3;

/**
 * Parse a `#rrggbb` or `#rgb` hex colour into 0–255 channels.
 *
 * @throws Error if the value is not a hex colour
 */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((d) => d + d)
          .join("")
      : match[1];
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

/** Relative luminance of a hex colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1 to 21, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
