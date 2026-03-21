/**
 * Public site colour palette
 *
 * Single source of truth for every colour used on the public-facing pages.
 * Import named values in TSX components; CSS modules use the matching
 * custom properties defined in colours.css.
 */

export const colours = {
  /** Primary dark background — navy */
  navy: "#0a1628",
  /** Secondary dark background — dark blue (cards, light sections) */
  darkBlue: "#112240",
  /** Card hover background */
  darkBlueHover: "#152a4a",

  /** Primary accent — amber */
  amber: "#C8963E",
  /** Brighter amber for nav icons */
  navIconAmber: "#E0A94A",
  /** Amber hover state (filled buttons) */
  amberHover: "#b5862f",
  /** Gold hover state (nav links) */
  goldHover: "#e8a317",

  /** Off-white text (headings on dark) */
  offWhite: "#fdfbf7",
  /** Body text on dark backgrounds */
  lightText: "rgba(245, 240, 232, 0.55)",
  /** Muted grey (footer links) */
  muted: "#909296",
} as const;
