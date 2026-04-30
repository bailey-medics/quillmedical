/**
 * Quill Medical Theme Configuration
 *
 * Centralized theme for consistent typography and styling across the app.
 * All font sizes, spacing, and other design tokens should be defined here.
 *
 * Font Size System (4 sizes - responsive, accessibility-focused):
 * - xs/sm: 0.875rem (14px) → 1rem (16px) - Small text, captions, metadata
 * - md:    1rem (16px) → 1.1875rem (19px) - Body text (accessible standard)
 * - lg:    1.25rem (20px) → 1.5rem (24px) - Subheadings, section titles
 * - xl:    1.625rem (26px) → 2rem (32px)  - Page headings, primary titles
 *
 * Responsive behavior:
 * - Mobile first (base sizes)
 * - Scales up on tablet/desktop (min-width: 48em / 768px)
 * - Designed for healthcare accessibility standards
 *
 * Usage:
 * ```tsx
 * <Text size="sm">Small text</Text>
 * <Text size="md">Body text (default, 19px on desktop)</Text>
 * <Title order={3} size="lg">Subheading</Title>
 * <Title order={1} size="xl">Page heading</Title>
 * ```
 */

import { createTheme, type CSSVariablesResolver } from "@mantine/core";

/**
 * Brand colour tokens — single source of truth.
 * Exposed as CSS variables via cssVariablesResolver below.
 *
 * In TypeScript: import { brandColours, publicColours } from "@/theme"
 */
export const brandColours = {
  primary: "#001a36",
  secondary: "#C8963E",
  background: "#ffffff",
} as const;

/** Public site colour palette */
export const publicColours = {
  navy: brandColours.primary,
  darkBlue: "#112240",
  darkBlueHover: "#152a4a",
  amber: "#C8963E",
  amberHover: "#b5862f",
  goldHover: "#e8a317",
  offWhite: "#fdfbf7",
  lightText: "rgb(245 240 232 / 55%)",
  muted: "#909296",
} as const;

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // App brand
    "--brand-primary": brandColours.primary,
    "--brand-secondary": brandColours.secondary,
    "--brand-background": brandColours.background,
    // Public site
    "--public-navy": publicColours.navy,
    "--public-dark-blue": publicColours.darkBlue,
    "--public-dark-blue-hover": publicColours.darkBlueHover,
    "--public-amber": publicColours.amber,
    "--public-amber-hover": publicColours.amberHover,
    "--public-gold-hover": publicColours.goldHover,
    "--public-off-white": publicColours.offWhite,
    "--public-light-text": publicColours.lightText,
    "--public-muted": publicColours.muted,
  },
  dark: {},
  light: {},
});

export const theme = createTheme({
  /**
   * Font sizes - responsive sizing for healthcare accessibility
   *
   * Base sizes (mobile): Smaller for limited screen space
   * Desktop sizes: Larger for improved readability
   *
   * Note: xs and sm share the same size to reduce complexity.
   * Responsive scaling handled via CSS custom properties.
   */
  fontSizes: {
    xs: "0.875rem", // 14px mobile → 16px desktop (via CSS)
    sm: "0.875rem", // 14px mobile → 16px desktop (same as xs)
    md: "1rem", // 16px mobile → 19px desktop (accessible standard)
    lg: "1.25rem", // 20px mobile → 24px desktop
    xl: "1.625rem", // 26px mobile → 32px desktop
  },

  /**
   * Heading sizes - Responsive, accessibility-aligned
   * Maps h1-h6 to our font size system with appropriate line heights
   */
  headings: {
    sizes: {
      h1: { fontSize: "1.625rem", lineHeight: "1.3" }, // 26px → 32px (xl)
      h2: { fontSize: "1.5rem", lineHeight: "1.35" }, // 24px → 28px
      h3: { fontSize: "1.25rem", lineHeight: "1.4" }, // 20px → 24px (lg)
      h4: { fontSize: "1rem", lineHeight: "1.5" }, // 16px → 19px (md)
      h5: { fontSize: "0.875rem", lineHeight: "1.55" }, // 14px → 16px (sm)
      h6: { fontSize: "0.875rem", lineHeight: "1.55" }, // 14px → 16px (sm)
    },
  },

  /**
   * Breakpoints - for responsive typography
   * Matches Mantine defaults, with mobile-first approach
   */
  breakpoints: {
    xs: "36em", // 576px
    sm: "48em", // 768px - Main responsive breakpoint for font scaling
    md: "62em", // 992px
    lg: "75em", // 1200px
    xl: "88em", // 1408px
  },
});
