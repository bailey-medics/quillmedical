/**
 * Quill Medical Theme Configuration
 *
 * Centralized theme for consistent typography and styling across the app.
 * All font sizes, spacing, and other design tokens should be defined here.
 *
 * Font Size System (4 sizes - NHS-aligned, responsive):
 * - xs/sm: 0.875rem (14px) → 1rem (16px) - Small text, captions, metadata
 * - md:    1rem (16px) → 1.1875rem (19px) - Body text (NHS standard)
 * - lg:    1.25rem (20px) → 1.5rem (24px) - Subheadings, section titles
 * - xl:    1.625rem (26px) → 2rem (32px)  - Page headings, primary titles
 *
 * Responsive behavior:
 * - Mobile first (base sizes)
 * - Scales up on tablet/desktop (min-width: 48em / 768px)
 * - Matches NHS design system accessibility standards
 *
 * Usage:
 * ```tsx
 * <Text size="sm">Small text</Text>
 * <Text size="md">Body text (default, 19px on desktop)</Text>
 * <Title order={3} size="lg">Subheading</Title>
 * <Title order={1} size="xl">Page heading</Title>
 * ```
 */

import { createTheme } from "@mantine/core";

export const theme = createTheme({
  /**
   * Font sizes - NHS-inspired responsive sizing
   *
   * Base sizes (mobile): Smaller for limited screen space
   * Desktop sizes: Larger for improved readability (matches NHS standards)
   *
   * Note: xs and sm share the same size to reduce complexity.
   * Responsive scaling handled via CSS custom properties.
   */
  fontSizes: {
    xs: "0.875rem", // 14px mobile → 16px desktop (via CSS)
    sm: "0.875rem", // 14px mobile → 16px desktop (same as xs)
    md: "1rem", // 16px mobile → 19px desktop (NHS body standard)
    lg: "1.25rem", // 20px mobile → 24px desktop
    xl: "1.625rem", // 26px mobile → 32px desktop
  },

  /**
   * Default font size for body text
   * Responsive: 16px mobile → 19px desktop
   */
  fontSizeMd: "1rem",

  /**
   * Heading sizes - Responsive, NHS-aligned
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
   * Default color scheme
   */
  defaultColorScheme: "light",

  /**
   * Line heights for better readability
   * NHS recommends generous line spacing for accessibility
   */
  lineHeights: {
    xs: "1.5",
    sm: "1.5",
    md: "1.6",
    lg: "1.4",
    xl: "1.3",
  },

  /**
   * Breakpoints - for responsive typography
   * Matches Mantine defaults, aligned with NHS mobile-first approach
   */
  breakpoints: {
    xs: "36em", // 576px
    sm: "48em", // 768px - Main responsive breakpoint for font scaling
    md: "62em", // 992px
    lg: "75em", // 1200px
    xl: "88em", // 1408px
  },
});
