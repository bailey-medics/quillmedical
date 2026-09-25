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
  deepMerge,
  NavLink,
  v8CssVariablesResolver,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

import brand from "@/generated/brand.json";
import navLinkClasses from "./styles/navLink.module.css";

/**
 * Brand colour tokens — from shared/brand.yaml, the single source of truth
 * shared with the backend's email renderer.
 * Exposed as CSS variables via cssVariablesResolver below.
 *
 * In TypeScript: import { brandColours } from "@/theme"
 */
export const brandColours = brand.brand;

/**
 * Mantine needs exactly ten shades per colour. The YAML is a plain list,
 * so check the length here: a ramp one shade short would otherwise shift
 * every shade name by one without any error.
 */
function toColoursTuple(name: string, shades: string[]): MantineColorsTuple {
  const [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, ...rest] = shades;
  if (
    s0 === undefined ||
    s1 === undefined ||
    s2 === undefined ||
    s3 === undefined ||
    s4 === undefined ||
    s5 === undefined ||
    s6 === undefined ||
    s7 === undefined ||
    s8 === undefined ||
    s9 === undefined ||
    rest.length > 0
  ) {
    throw new Error(
      `shared/brand.yaml: the ${name} palette needs exactly 10 shades, ` +
        `not ${shades.length}`,
    );
  }
  return [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9];
}

/**
 * Mantine colour scales — 10-shade ramps (0 lightest → 9 darkest), with
 * each shade's use noted in shared/brand.yaml.
 *
 * primary: Navy. Shade 5 is primaryShade, for filled buttons and actions;
 *          shade 8 is the brand primary (#001a36).
 * secondary: Amber. Shade 5 is the brand secondary (#C8963E). Use for
 *            CTAs, highlights, and warm accents.
 */
export const primaryScale = toColoursTuple("primary", brand.palette.primary);

export const secondaryScale = toColoursTuple(
  "secondary",
  brand.palette.secondary,
);

/**
 * Neutral grey scale — Mantine defaults (0–7).
 *
 * Used for table striping, dividers, placeholders, and subtle backgrounds.
 * Matches the Mantine `gray` colour key so `gray.0` === greyScale[0], etc.
 */
export const greyScale: readonly string[] = brand.palette.grey;

/**
 * Status colour tokens — semantic colours for badges, alerts, and buttons.
 *
 * Registered as CSS variables (e.g. `var(--success-color)`) via
 * cssVariablesResolver. Shared across light and dark modes — these are
 * used as filled backgrounds with white/dark text.
 *
 * Every fill that takes white text is dark enough for WCAG AA, 4.5:1,
 * which is why most are shade 7 to 9 rather than Mantine's default 6: at
 * shade 6, white on teal was 2.6:1 and white on cyan 2.8:1. The hues are
 * unchanged, so colour-blind users still tell them apart as before, and
 * each status still carries an icon. `theme.test.ts` holds them to it.
 *
 * Note: `--error-color` is a separate token for form validation
 * borders (accessibility-tuned). `--error-focus-color` (#ffb3b3) is a lighter
 * variant used when an errored field receives focus. `--alert-color`
 * is for status badges, destructive buttons, and notifications.
 */
export const statusColourValues = {
  success: "#087f5b", // Teal — active, completed, pass (Mantine teal.9, 5.0:1)
  warning: "#0b7285", // Cyan — draft, pending (Mantine cyan.9, 5.6:1)
  outstanding: "#d6336c", // Pink — deactivated, cancelled, fail (Mantine pink.7, 4.6:1)
  info: "#1971c2", // Blue — upcoming, informational (Mantine blue.8, 5.0:1)
  neutral: "#ffd43b", // Yellow — staff, default (Mantine yellow.4, dark text)
  accent: "#7950f2", // Violet — incomplete, special states (Mantine violet.6, 5.0:1)
  alert: "#c92a2a", // Red — no-show, patient, attention (Mantine red.9, 5.5:1)
  // The odd one out, deliberately: a pale wash rather than a saturated
  // fill, and the only status colour that takes dark text. The others
  // report that something has happened; this one says something has
  // not happened yet, or invites the reader to act. A solid fill made
  // an empty passport look like a warning about an ordinary situation.
  update: "#e7f5ff", // Very light blue — nothing yet, gentle prompts (Mantine blue.0)
} as const;

/**
 * Status colours used as text — the word itself in the status colour,
 * with no fill behind it ("Fail" in red in a results table, "Updating" in
 * blue in the status strip).
 *
 * A fill and a word need different shades. A fill takes white text, so
 * it must be dark; a word sits on the page, so in dark mode it must be
 * light. One token cannot do both, which is how the fills came to fail on
 * navy once they were darkened for white text.
 *
 * Light values pass WCAG AA, 4.5:1, on white and on `gray.2`, the darkest
 * grey surface text sits on; teal, cyan and red are a step darker than
 * Mantine's shade 9 to get there. Dark values are Mantine's shade 3,
 * which pass on every navy surface, `primary.9` included.
 */
export const statusTextColourValues = {
  light: {
    success: "#07704f",
    warning: "#0b6b7a",
    outstanding: "#a61e4d", // pink.9
    info: "#1864ab", // blue.9
    accent: "#6741d9", // violet.8
    alert: "#b02525",
  },
  dark: {
    success: "#63e6be", // teal.3
    warning: "#66d9e8", // cyan.3
    outstanding: "#faa2c1", // pink.3
    info: "#74c0fc", // blue.3
    accent: "#b197fc", // violet.3
    alert: "#ff8787", // red.3
  },
} as const;

/** `--success-text-color` etc., for one colour scheme's variables. */
function statusTextVariables(
  values: Record<keyof typeof statusTextColourValues.light, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      `--${name}-text-color`,
      value,
    ]),
  );
}

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

  /**
   * Height of the skeleton that stands in for an ActionCard while a
   * page is loading. Matched to the card so the page settles into
   * place rather than changing shape when the real content arrives.
   */
  actionCardSkeletonHeight: "9.5rem",
} as const;

/**
 * App-specific CSS variables, layered on top of Mantine's own.
 *
 * Mantine 9 changed how the `-light`, `-light-hover` and `-light-color`
 * variants of every colour are derived. Mantine 8 used a translucent
 * wash of the primary shade (10% / 12% in light mode, 15% / 20% of a
 * lighter shade in dark mode). Mantine 9 uses solid palette shades
 * instead, which with our navy scale made the selected and hovered
 * side-navigation links (and every other `variant="light"` surface)
 * far heavier than intended. `v8CssVariablesResolver` is Mantine's own
 * opt-in that restores the Mantine 8 derivation, so we build on it
 * rather than the default.
 */
const appCssVariables = {
  variables: {
    // App brand
    "--brand-primary": brandColours.primary,
    "--brand-secondary": brandColours.secondary,
    "--brand-background": brandColours.background,
    // Button interaction colours — amber button text/active states.
    // Brand navy, not #333: on the amber fill #333 was 4.75:1, and on the
    // hover and pressed shades 3.3:1 and 3.1:1, under WCAG AA. Navy is
    // 6.6:1 and 4.6:1, but 4.3:1 on the pressed shade, still just under.
    "--button-text-dark": brandColours.primary,
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
    "--update-color": statusColourValues.update,
    // Text on a status fill that asks for dark. Near-black rather than
    // the app's navy body colour: navy on the yellow `neutral` fill is
    // a markedly weaker contrast than black, and these fills exist to
    // be read at a glance.
    "--status-text-dark": "#1a1a1a",
  },
  dark: {
    // Text — light grey on dark background (placeholder values, to be refined)
    "--mantine-color-text": "#c9d1d9",
    // Muted text (`c="dimmed"`). Mantine's default is `dark-2`, which this
    // theme repurposes as a navy surface, leaving dimmed text at 1.2:1.
    // primary.1 is at least 6.3:1 on the body, card and input navies.
    "--mantine-color-dimmed": primaryScale[1],
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
    // Error text/border — accessible orange-red for colour-blind users.
    // A light coral in dark mode: 5.8:1 on the input navy, where the
    // light-mode value is 3.9:1.
    "--mantine-color-error": "var(--error-color)",
    "--error-color": "#ff8a65",
    "--error-focus-color": "#ffb3b3",
    // Links: primary.4 is 2.3:1 on the card navy, primary.1 is 6.3:1 or
    // better on every dark surface. Hover goes lighter, not darker.
    "--link-color": primaryScale[1],
    "--link-hover-color": primaryScale[0],
    // Mantine's own Anchor colour, pointed at the link token. TextLink's
    // CSS module sets the same colour, but which of the two wins depends
    // on stylesheet order, which differs between Storybook and the
    // production build: the e2e scan caught primary.4 on the login page.
    "--mantine-color-anchor": "var(--link-color)",
    // Chat bubble backgrounds. Mine is primary.5 rather than primary.4:
    // body text on primary.4 was 4.47:1, just under AA.
    "--bubble-mine-bg": primaryScale[5],
    "--bubble-theirs-bg": "#0a2f56",
    "--bubble-shadow": "none",
    "--bubble-border-top": "1px solid #0a2f56",
    // Current nav link — brand amber, ample contrast on navy
    "--nav-active-colour": "var(--mantine-color-secondary-5)",
    // Nav link hover — Mantine's own non-active hover shade
    "--nav-hover-bg": "var(--mantine-color-dark-6)",
    ...statusTextVariables(statusTextColourValues.dark),
  },
  light: {
    "--mantine-color-text": "#143f6b",
    // Muted text (`c="dimmed"`). Mantine's default gray.6 is 3.3:1 on
    // white, under the WCAG AA 4.5:1 for body text; gray.7 is 8.2:1 on
    // white and 6.9:1 on gray.2.
    "--mantine-color-dimmed": greyScale[7],
    "--mantine-color-placeholder": "var(--mantine-color-gray-4)",
    // Error text/border — accessible orange-red for colour-blind users.
    // The same hue as before, darkened: the old #f55142 was 3.4:1 on
    // white, #c4320a is 5.5:1 on white and 4.7:1 on gray.2.
    "--mantine-color-error": "var(--error-color)",
    "--error-color": "#c4320a",
    "--error-focus-color": "#ffb3b3",
    // Links: primary.4 is 6.9:1 on white; hover darkens to the brand navy.
    "--link-color": primaryScale[4],
    "--link-hover-color": primaryScale[8],
    "--mantine-color-anchor": "var(--link-color)",
    "--bubble-mine-bg": "#bdd2eb",
    "--bubble-theirs-bg": "#fae8cc",
    "--bubble-shadow": "0 1px 0 rgba(0,0,0,0.06)",
    "--bubble-border-top": "1px solid rgba(0,0,0,0.06)",
    // Current nav link — amber, darkened to secondary.7 for light mode:
    // the brand secondary.5 is 2.7:1 on white, secondary.7 is 5.5:1
    "--nav-active-colour": "var(--mantine-color-secondary-7)",
    "--nav-hover-bg": "var(--mantine-color-gray-0)",
    ...statusTextVariables(statusTextColourValues.light),
  },
};

export const cssVariablesResolver: CSSVariablesResolver = (mantineTheme) =>
  deepMerge(v8CssVariablesResolver(mantineTheme), appCssVariables);

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
   * Focus ring on keyboard focus only (Mantine's default, set so it is
   * a decision rather than an accident), and no animation for anyone
   * whose system asks for reduced motion. Mantine defaults
   * respectReducedMotion to false.
   */
  focusRing: "auto",
  respectReducedMotion: true,

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
    /** Current nav link — amber label and icon, no fill (see navLink.module.css) */
    NavLink: NavLink.extend({
      // A button unless a caller says otherwise. Mantine renders an <a>,
      // and an <a> with no href is not focusable, so every NavLink that
      // navigated in an onClick (the whole side navigation) could not be
      // reached from the keyboard. Links pass `component={Link}`.
      defaultProps: { component: "button" },
      classNames: navLinkClasses,
      vars: () => ({
        root: {
          "--nl-color": "var(--nav-active-colour)",
          // No fill on the current link; hover matches the other links
          "--nl-bg": "transparent",
          "--nl-hover": "var(--nav-hover-bg)",
        },
        children: {},
      }),
    }),
    // Mantine's modal close button is an icon with no accessible name,
    // so a screen reader announces only "button" (axe button-name).
    // Set once here for every modal rather than at each call site.
    // "Close dialog" rather than "Close": several modals end on a text
    // button that says "Close", and two buttons of one name are
    // indistinguishable in a screen reader's list of buttons.
    Modal: {
      defaultProps: {
        closeButtonProps: { "aria-label": "Close dialog" },
      },
    },
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
