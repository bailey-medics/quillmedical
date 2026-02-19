/**
 * Quill Medical Theme Configuration
 *
 * Centralized theme for consistent typography and styling across the app.
 * All font sizes, spacing, and other design tokens should be defined here.
 *
 * Font Size System (4 sizes):
 * - xs/sm: 0.875rem (14px) - Captions, hints, metadata, secondary text
 * - md:    1rem (16px)     - Body text, default size
 * - lg:    1.25rem (20px)  - Subheadings, section titles
 * - xl:    1.75rem (28px)  - Page headings, primary titles
 *
 * Usage:
 * ```tsx
 * <Text size="sm">Small text</Text>
 * <Text size="md">Body text (default)</Text>
 * <Title order={3} size="lg">Subheading</Title>
 * <Title order={1} size="xl">Page heading</Title>
 * ```
 */

import { createTheme } from "@mantine/core";

export const theme = createTheme({
  /**
   * Font sizes - Limited to 4 sizes for consistency
   *
   * Note: xs and sm share the same size to reduce complexity.
   * Use xs/sm for small text, md for body, lg for subheadings, xl for headings.
   */
  fontSizes: {
    xs: "0.875rem", // 14px - Small text
    sm: "0.875rem", // 14px - Small text (same as xs)
    md: "1rem", // 16px - Body text (default)
    lg: "1.25rem", // 20px - Subheadings
    xl: "1.75rem", // 28px - Page headings
  },

  /**
   * Default font size for body text
   * Applied to all text without explicit size prop
   */
  fontSizeMd: "1rem",

  /**
   * Heading sizes - Maps h1-h6 to our font size system
   */
  headings: {
    sizes: {
      h1: { fontSize: "1.75rem", lineHeight: "2.25rem" }, // xl
      h2: { fontSize: "1.5rem", lineHeight: "2rem" }, // Between lg and xl
      h3: { fontSize: "1.25rem", lineHeight: "1.75rem" }, // lg
      h4: { fontSize: "1rem", lineHeight: "1.5rem" }, // md
      h5: { fontSize: "0.875rem", lineHeight: "1.25rem" }, // sm
      h6: { fontSize: "0.875rem", lineHeight: "1.25rem" }, // sm
    },
  },

  /**
   * Default color scheme
   */
  defaultColorScheme: "light",

  /**
   * Line heights for better readability
   */
  lineHeights: {
    xs: "1.25",
    sm: "1.4",
    md: "1.5",
    lg: "1.6",
    xl: "1.6",
  },
});
