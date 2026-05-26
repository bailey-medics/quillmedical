/**
 * Quill Medical Theme Configuration
 *
 * Centralized theme for consistent typography and styling across the app.
 * All font sizes, spacing, and other design tokens should be defined here.
 *
 * Font Size System (4 sizes — fixed, accessibility-focused):
 * - xs/sm: 1rem (16px) - Small text, captions, metadata
 * - md:    1.1875rem (19px) - Body text (accessible standard)
 * - lg:    1.5rem (24px) - Subheadings, section titles
 * - xl:    2rem (32px) - Page headings, primary titles
 *
 * All sizes are fixed across all screen sizes. 19px body text ensures
 * readability for all users regardless of device. Screen size does not
 * change how well someone can read.
 *
 * Usage:
 * ```tsx
 * <Text size="sm">Small text</Text>
 * <Text size="md">Body text (default, 19px everywhere)</Text>
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
 * In TypeScript: import { brandColours } from "@/theme"
 */
export const brandColours = {
  primary: "#001a36",
  secondary: "#C8963E",
  background: "#ffffff",
} as const;

/**
 * Mantine colour scales — 10-shade ramps (0 lightest → 9 darkest).
 *
 * primary: Navy scale derived from brandColours.primary (#001a36).
 *          primaryShade: 5 used for filled buttons/actions.
 *          Brand primary: shade 8 (#001a36).
 *
 * secondary: Amber scale derived from brandColours.secondary (#C8963E).
 *            Use for CTAs, highlights, and warm accents.
 */
export const primaryScale: MantineColorsTuple = [
  "#bdd2eb", // 0 — subtle backgrounds, variant="light" fills
  "#93b4d9", // 1 — light tint, hover on light variant
  "#6894c0", // 2 — borders, disabled states
  "#3d6fa0", // 3 — muted/secondary indicators
  "#245d8f", // 4 — medium prominence
  "#143f6b", // 5 — primary actions (filled buttons) ← primaryShade
  "#0a2f56", // 6 — card borders, dividers
  "#042340", // 7 — hover/pressed state
  "#001a36", // 8 — brand primary
  "#000d1f", // 9 — deepest navy (dark mode contrast)
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
 * Neutral grey scale — Mantine defaults (0–7).
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
  "#adb5bd", // 5 — secondary text, icons
  "#868e96", // 6 — muted labels
  "#495057", // 7 — field descriptions, strong muted text
] as const;

/**
 * Status colour tokens — semantic colours for badges, alerts, and buttons.
 *
 * Registered as CSS variables (e.g. `var(--success-color)`) via
 * cssVariablesResolver. Shared across light and dark modes — these are
 * used as filled backgrounds with white/dark text.
 *
 * Note: `--error-color` (#f55142) is a separate token for form validation
 * borders (accessibility-tuned). `--error-focus-color` (#ffb3b3) is a lighter
 * variant used when an errored field receives focus. `--alert-color` (#fa5252)
 * is for status badges, destructive buttons, and notifications.
 */
export const statusColourValues = {
  success: "#12b886", // Teal — active, completed, pass (Mantine teal.6)
  warning: "#15aabf", // Cyan — draft, pending (Mantine cyan.6)
  outstanding: "#e64980", // Pink — deactivated, cancelled, fail (Mantine pink.6)
  info: "#228be6", // Blue — upcoming, informational (Mantine blue.6)
  neutral: "#ffd43b", // Yellow — staff, default (Mantine yellow.4)
  accent: "#7950f2", // Violet — incomplete, special states (Mantine violet.6)
  alert: "#fa5252", // Red — no-show, patient, attention (Mantine red.6)
} as const;

/**
 * Typography tokens — single source of truth for all font sizes.
 *
 * All sizes are fixed (no responsive scaling). Font sizes remain constant
 * across all screen widths for maximum readability and consistency.
 * The 19px body text standard ensures accessibility for all users.
 */
export const typographyTokens = {
  fontWeights: {
    body: 500,
    bold: 700,
  },
  fontSizes: {
    xs: "1rem", // 16px
    sm: "1rem", // 16px
    md: "1.1875rem", // 19px — body text standard
    lg: "1.5rem", // 24px
    xl: "2rem", // 32px
  },
  headings: {
    h1: { fontSize: "2rem", lineHeight: "1.3" }, // 32px
    h2: { fontSize: "1.75rem", lineHeight: "1.35" }, // 28px
    h3: { fontSize: "1.5rem", lineHeight: "1.4" }, // 24px
    h4: { fontSize: "1.1875rem", lineHeight: "1.5" }, // 19px
    h5: { fontSize: "1rem", lineHeight: "1.55" }, // 16px
    h6: { fontSize: "1rem", lineHeight: "1.55" }, // 16px
  },
} as const;

/**
 * Layout tokens — shared responsive sizing thresholds.
 */
export const layoutTokens = {
  /**
   * Minimum viewport width required before ActionCards switch to a
   * two-column layout.
   */
  actionCardTwoColumnMinWidth: "60rem",
} as const;

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // App brand
    "--brand-primary": brandColours.primary,
    "--brand-secondary": brandColours.secondary,
    "--brand-background": brandColours.background,
    // Button interaction colours — amber button text/active states
    "--button-text-dark": "#333",
    "--button-active-bg": "#a07728",
    "--button-outline-hover-text": "#d4a854",
    // Burger menu hover background
    "--burger-hover-bg": "#1e2d4a",
    // Typography — fixed font sizes (applied on :root in typography.css)
    "--typo-xs": typographyTokens.fontSizes.xs,
    "--typo-sm": typographyTokens.fontSizes.sm,
    "--typo-md": typographyTokens.fontSizes.md,
    "--typo-lg": typographyTokens.fontSizes.lg,
    "--typo-xl": typographyTokens.fontSizes.xl,
    // Status colours — semantic design tokens
    "--success-color": statusColourValues.success,
    "--warning-color": statusColourValues.warning,
    "--alert-color": statusColourValues.alert,
    "--info-color": statusColourValues.info,
    "--neutral-color": statusColourValues.neutral,
    "--accent-color": statusColourValues.accent,
    "--outstanding-color": statusColourValues.outstanding,
  },
  dark: {
    // Text — light grey on dark background (placeholder values, to be refined)
    "--mantine-color-text": "#c9d1d9",
    "--mantine-color-placeholder": "#5c6370",
    // Body background — primary colour (#001a36, shade 8)
    "--mantine-color-body": "#001a36",
    "--brand-background": "#001a36",
    // Card/surface background — primary shade 7 (one lighter than body)
    "--card-bg": "#042340",
    "--card-border": "#0a2f56",
    "--card-border-color": "transparent",
    // Input background — Mantine dark uses --mantine-color-dark-6 for inputs
    "--mantine-color-default": "#0a2f56",
    "--mantine-color-dark-6": "#0a2f56",
    // Input border — deepest navy (shade 9)
    "--mantine-color-dark-4": "#000d1f",
    // Pill (multi-select tags) — text and background
    "--mantine-color-dark-0": "#c9d1d9",
    "--mantine-color-dark-7": "#0a2f56",
    // Dimmed text / input arrows
    "--mantine-color-dark-2": "#0a2f56",
    // Stepper inactive circles, outline separator
    "--mantine-color-dark-5": "#042340",
    // Error text/border — accessible orange-red for colour-blind users
    "--mantine-color-error": "var(--error-color)",
    "--error-color": "#f55142",
    "--error-focus-color": "#ffb3b3",
    // Chat bubble backgrounds
    "--bubble-mine-bg": "#245d8f",
    "--bubble-theirs-bg": "#0a2f56",
    "--bubble-shadow": "none",
    "--bubble-border-top": "1px solid #0a2f56",
  },
  light: {
    "--mantine-color-text": "#143f6b",
    "--mantine-color-placeholder": "var(--mantine-color-gray-4)",
    // Error text/border — accessible orange-red for colour-blind users
    "--mantine-color-error": "var(--error-color)",
    "--error-color": "#f55142",
    "--error-focus-color": "#ffb3b3",
    "--bubble-mine-bg": "#bdd2eb",
    "--bubble-theirs-bg": "#fae8cc",
    "--bubble-shadow": "0 1px 0 rgba(0,0,0,0.06)",
    "--bubble-border-top": "1px solid rgba(0,0,0,0.06)",
  },
});

export const theme = createTheme({
  /** App font — Atkinson Hyperlegible Next (Braille Institute) */
  fontFamily: "'Atkinson Hyperlegible Next Variable', sans-serif",

  /** Monospace font — for code blocks, inline code, and technical data */
  fontFamilyMonospace:
    "'SF Mono', SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",

  /** Default text colour — brand navy instead of pure black */
  black: "#143f6b",

  /** Colour scales — primary (navy) and secondary (amber) */
  colors: {
    primary: primaryScale,
    secondary: secondaryScale,
  },

  /** Use primary navy as the default colour for all components */
  primaryColor: "primary",
  primaryShade: 5,

  /**
   * Font sizes — handled in typography.css via CSS custom properties.
   * Fixed across all screen widths (no responsive scaling).
   */

  /** Heading sizes — fixed values from typographyTokens */
  headings: {
    sizes: {
      h1: {
        fontSize: typographyTokens.headings.h1.fontSize,
        lineHeight: typographyTokens.headings.h1.lineHeight,
      },
      h2: {
        fontSize: typographyTokens.headings.h2.fontSize,
        lineHeight: typographyTokens.headings.h2.lineHeight,
      },
      h3: {
        fontSize: typographyTokens.headings.h3.fontSize,
        lineHeight: typographyTokens.headings.h3.lineHeight,
      },
      h4: {
        fontSize: typographyTokens.headings.h4.fontSize,
        lineHeight: typographyTokens.headings.h4.lineHeight,
      },
      h5: {
        fontSize: typographyTokens.headings.h5.fontSize,
        lineHeight: typographyTokens.headings.h5.lineHeight,
      },
      h6: {
        fontSize: typographyTokens.headings.h6.fontSize,
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
    sm: "40em", // 640px - Main responsive breakpoint
    md: "62em", // 992px
    lg: "75em", // 1200px
    xl: "88em", // 1408px
  },

  components: {
    Badge: {
      defaultProps: {
        size: "lg",
      },
      styles: {
        label: { fontSize: "1.1875rem" }, // 19px — GOV.UK minimum
      },
    },
  },
});
