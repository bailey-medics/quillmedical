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

import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

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
  amberBright: "#e8a317",
  navIconAmber: "#E0A94A",
  offWhite: "#fdfbf7",
  lightText: "rgb(245 240 232 / 55%)",
  muted: "#909296",
} as const;

/**
 * Mantine colour scales — 10-shade ramps (0 lightest → 9 darkest).
 *
 * primary: Navy scale derived from brandColours.primary (#001a36).
 *          primaryShade: 7 used for filled buttons/actions.
 *
 * secondary: Amber scale derived from brandColours.secondary (#C8963E).
 *            Use for CTAs, highlights, and warm accents.
 */
export const primaryScale: MantineColorsTuple = [
  "#e3edf8", // 0 — subtle backgrounds, variant="light" fills
  "#bdd2eb", // 1 — light tint, hover on light variant
  "#93b4d9", // 2 — borders, disabled states
  "#6894c0", // 3 — muted/secondary indicators
  "#3d6fa0", // 4 — mid-tone
  "#245d8f", // 5 — medium prominence
  "#143f6b", // 6 — prominent elements
  "#0a2f56", // 7 — primary actions (filled buttons) ← primaryShade
  "#042340", // 8 — hover/pressed state
  "#001a36", // 9 — brand text (darkest)
];

export const secondaryScale: MantineColorsTuple = [
  "#fdf6ec", // 0 — subtle amber backgrounds
  "#fae8cc", // 1 — light amber fill
  "#f5d5a0", // 2 — amber borders
  "#efc072", // 3 — decorative amber
  "#e5a84a", // 4 — secondary amber
  "#c8963e", // 5 — brand amber
  "#a87b2f", // 6 — prominent amber
  "#886223", // 7 — dark amber
  "#6b4c1a", // 8 — darker amber
  "#503813", // 9 — darkest amber
];

/**
 * Neutral grey scale — Mantine defaults, light shades only (0–4).
 *
 * Used for table striping, dividers, placeholders, and subtle backgrounds.
 * Matches the Mantine `gray` colour key so `gray.0` === greyScale[0], etc.
 */
export const greyScale = [
  "#f8f9fa", // 0 — table striped rows, subtle backgrounds
  "#f1f3f5", // 1 — light dividers, card backgrounds
  "#e9ecef", // 2 — borders, separators
  "#dee2e6", // 3 — disabled backgrounds
  "#ced4da", // 4 — placeholder text
] as const;

/**
 * Typography tokens — single source of truth for all font sizes.
 *
 * Mobile values are consumed by Mantine's createTheme(). Desktop values
 * are exposed as CSS custom properties (--typo-desktop-*) and applied
 * at the sm breakpoint (48em / 768px) in typography.css.
 */
export const typographyTokens = {
  fontWeights: {
    body: 500,
    bold: 700,
  },
  fontSizes: {
    xs: { mobile: "0.875rem", desktop: "1rem" }, // 14px → 16px
    sm: { mobile: "0.875rem", desktop: "1rem" }, // 14px → 16px
    md: { mobile: "1rem", desktop: "1.1875rem" }, // 16px → 19px
    lg: { mobile: "1.25rem", desktop: "1.5rem" }, // 20px → 24px
    xl: { mobile: "1.625rem", desktop: "2rem" }, // 26px → 32px
  },
  headings: {
    h1: { mobile: "1.625rem", desktop: "2rem", lineHeight: "1.3" },
    h2: { mobile: "1.5rem", desktop: "1.75rem", lineHeight: "1.35" },
    h3: { mobile: "1.25rem", desktop: "1.5rem", lineHeight: "1.4" },
    h4: { mobile: "1rem", desktop: "1.1875rem", lineHeight: "1.5" },
    h5: { mobile: "0.875rem", desktop: "1rem", lineHeight: "1.55" },
    h6: { mobile: "0.875rem", desktop: "1rem", lineHeight: "1.55" },
  },
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
    "--public-amber-bright": publicColours.amberBright,
    "--public-nav-icon-amber": publicColours.navIconAmber,
    "--public-off-white": publicColours.offWhite,
    "--public-light-text": publicColours.lightText,
    "--public-muted": publicColours.muted,
    // Typography — desktop sizes (applied at sm breakpoint via CSS)
    "--typo-desktop-xs": typographyTokens.fontSizes.xs.desktop,
    "--typo-desktop-sm": typographyTokens.fontSizes.sm.desktop,
    "--typo-desktop-md": typographyTokens.fontSizes.md.desktop,
    "--typo-desktop-lg": typographyTokens.fontSizes.lg.desktop,
    "--typo-desktop-xl": typographyTokens.fontSizes.xl.desktop,
    "--typo-desktop-h1": typographyTokens.headings.h1.desktop,
    "--typo-desktop-h2": typographyTokens.headings.h2.desktop,
    "--typo-desktop-h3": typographyTokens.headings.h3.desktop,
    "--typo-desktop-h4": typographyTokens.headings.h4.desktop,
    "--typo-desktop-h5": typographyTokens.headings.h5.desktop,
    "--typo-desktop-h6": typographyTokens.headings.h6.desktop,
  },
  dark: {},
  light: {
    "--mantine-color-text": "#143f6b",
    "--mantine-color-placeholder": "var(--mantine-color-gray-4)",
  },
});

export const theme = createTheme({
  /** App font — Atkinson Hyperlegible Next (Braille Institute) */
  fontFamily: "'Atkinson Hyperlegible Next Variable', sans-serif",

  /** Default text colour — brand navy instead of pure black */
  black: "#143f6b",

  /** Colour scales — primary (navy) and secondary (amber) */
  colors: {
    primary: primaryScale,
    secondary: secondaryScale,
  },

  /** Use primary navy as the default colour for all components */
  primaryColor: "primary",
  primaryShade: 6,

  /** Font sizes — mobile-first base values from typographyTokens */
  fontSizes: {
    xs: typographyTokens.fontSizes.xs.mobile,
    sm: typographyTokens.fontSizes.sm.mobile,
    md: typographyTokens.fontSizes.md.mobile,
    lg: typographyTokens.fontSizes.lg.mobile,
    xl: typographyTokens.fontSizes.xl.mobile,
  },

  /** Heading sizes — mobile-first values from typographyTokens */
  headings: {
    sizes: {
      h1: {
        fontSize: typographyTokens.headings.h1.mobile,
        lineHeight: typographyTokens.headings.h1.lineHeight,
      },
      h2: {
        fontSize: typographyTokens.headings.h2.mobile,
        lineHeight: typographyTokens.headings.h2.lineHeight,
      },
      h3: {
        fontSize: typographyTokens.headings.h3.mobile,
        lineHeight: typographyTokens.headings.h3.lineHeight,
      },
      h4: {
        fontSize: typographyTokens.headings.h4.mobile,
        lineHeight: typographyTokens.headings.h4.lineHeight,
      },
      h5: {
        fontSize: typographyTokens.headings.h5.mobile,
        lineHeight: typographyTokens.headings.h5.lineHeight,
      },
      h6: {
        fontSize: typographyTokens.headings.h6.mobile,
        lineHeight: typographyTokens.headings.h6.lineHeight,
      },
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
