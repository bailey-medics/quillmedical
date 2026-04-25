/**
 * Semantic Colour Palette
 *
 * Single source of truth for all design token colours in the app.
 * Components should import from here rather than hardcoding colour values.
 *
 * Organised into:
 * - Brand: primary and secondary brand colours
 * - Status: state-communicating colours (badges, alerts, validation)
 * - Text: typography colour tokens
 */

/* ------------------------------------------------------------------ */
/*  Brand colours                                                      */
/* ------------------------------------------------------------------ */

export const brand = {
  /** Deep navy blue — primary actions, navigation, brand identity */
  primary: "#001a36",
  /** Gold accent — secondary buttons, highlights, hover states */
  secondary: "#C8963E",
} as const;

/* ------------------------------------------------------------------ */
/*  Status colours                                                     */
/* ------------------------------------------------------------------ */

type StatusColourConfig = {
  /** Background colour (Mantine colour token or hex) */
  bg: string;
  /** Text colour for contrast on the background */
  text: string;
  /** When to use this colour */
  usage: string;
};

export type StatusColourName =
  | "success"
  | "warning"
  | "outstanding"
  | "info"
  | "neutral"
  | "accent"
  | "alert";

export const statusColours: Record<StatusColourName, StatusColourConfig> = {
  success: {
    bg: "green",
    text: "white",
    usage: "Active, completed, final, pass",
  },
  warning: {
    bg: "yellow.8",
    text: "white",
    usage: "Draft, pending",
  },
  outstanding: {
    bg: "pink",
    text: "white",
    usage: "Deactivated, cancelled, fail",
  },
  info: {
    bg: "blue",
    text: "white",
    usage: "Upcoming, amended, admin, unread",
  },
  neutral: {
    bg: "yellow.4",
    text: "dark",
    usage: "Staff, default",
  },
  accent: {
    bg: "violet",
    text: "white",
    usage: "Incomplete, special states",
  },
  alert: {
    bg: "red",
    text: "white",
    usage: "No-show, patient, attention needed",
  },
};

/* ------------------------------------------------------------------ */
/*  Text colours                                                       */
/* ------------------------------------------------------------------ */

type TextColourConfig = {
  /** Mantine `c` prop value, CSS variable, or description */
  value: string;
  /** When to use this colour */
  usage: string;
};

export const textColours: Record<string, TextColourConfig> = {
  default: {
    value: "inherit",
    usage: "HeaderText, PageHeader — default black headings",
  },
  body: {
    value: "dimmed",
    usage: "BodyText, BodyTextClamp — secondary body text",
  },
  emphasis: {
    value: "black",
    usage: "BodyTextBlack, BodyTextBold — emphasised body text",
  },
  error: {
    value: "red.8",
    usage: "ErrorText — validation and error messages",
  },
  placeholder: {
    value: "var(--mantine-color-placeholder)",
    usage: "PlaceholderText — empty field hints",
  },
};
