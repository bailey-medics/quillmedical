/**
 * Semantic Colour Palette
 *
 * Brand colours are defined in theme.ts (which generates CSS variables).
 * This file re-exports them for TypeScript consumers and adds status/text tokens.
 *
 * Organised into:
 * - Brand: primary and secondary brand colours (from theme.ts)
 * - Status: state-communicating colours (badges, alerts, validation)
 * - Text: typography colour tokens
 *
 * Status colours use CSS variables (e.g. "var(--success-color)") defined
 * in theme.ts via cssVariablesResolver. `bg` is identical in light and
 * dark modes, a filled background with white or dark text; `fg` is the
 * status as a word on the page, and changes with the scheme.
 */

import { brandColours } from "@/theme";

/* ------------------------------------------------------------------ */
/*  Brand colours                                                      */
/* ------------------------------------------------------------------ */

export const brand = brandColours;

/* ------------------------------------------------------------------ */
/*  Status colours                                                     */
/* ------------------------------------------------------------------ */

type StatusColourConfig = {
  /** Background colour (Mantine colour token or hex) */
  bg: string;
  /**
   * Colour for the status as a word on the page, with no fill: follows
   * the colour scheme, where `bg` does not. Never use `bg` for text.
   */
  fg: string;
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
  | "alert"
  | "update";

export const statusColours: Record<StatusColourName, StatusColourConfig> = {
  success: {
    bg: "var(--success-color)",
    fg: "var(--success-text-color)",
    text: "white",
    usage: "Active, completed, final, pass",
  },
  warning: {
    bg: "var(--warning-color)",
    fg: "var(--warning-text-color)",
    text: "white",
    usage: "Draft, pending",
  },
  outstanding: {
    bg: "var(--outstanding-color)",
    fg: "var(--outstanding-text-color)",
    text: "white",
    usage: "Deactivated, cancelled, fail",
  },
  info: {
    bg: "var(--info-color)",
    fg: "var(--info-text-color)",
    text: "white",
    usage: "Upcoming, amended, admin, unread",
  },
  neutral: {
    bg: "var(--neutral-color)",
    // A yellow word is unreadable on white; neutral text is body text.
    fg: "var(--mantine-color-text)",
    text: "dark",
    usage: "Staff, default",
  },
  accent: {
    bg: "var(--accent-color)",
    fg: "var(--accent-text-color)",
    text: "white",
    usage: "Incomplete, special states",
  },
  alert: {
    bg: "var(--alert-color)",
    fg: "var(--alert-text-color)",
    text: "white",
    usage: "No-show, patient, attention needed",
  },
  update: {
    bg: "var(--update-color)",
    fg: "var(--mantine-color-text)",
    text: "dark",
    usage: "Nothing recorded yet, and gentle prompts to act",
  },
};

/**
 * The CSS colour to paint text in, on a given status colour's fill.
 *
 * `text` above says "white" or "dark", and "dark" needs resolving to an
 * actual colour. Doing that at each call site is how a swatch and the
 * card beside it came to disagree: one passed "dark" to Mantine and got
 * its near-black, the other resolved it to the app's navy body colour.
 * One function, so they cannot drift again.
 *
 * It resolves to near-black rather than the navy: on the yellow
 * `neutral` fill the navy is a markedly weaker contrast, and a status
 * fill exists to be read at a glance. The navy remains the body text
 * colour everywhere off a coloured fill.
 */
export function statusTextColour(name: StatusColourName): string {
  return statusColours[name].text === "dark"
    ? "var(--status-text-dark)"
    : "white";
}

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
    usage: "Heading, PageHeader — default black headings",
  },
  body: {
    value: "var(--mantine-color-text)",
    usage: "BodyText — primary body text (inherits theme navy)",
  },
  error: {
    value: "orange.8",
    usage: "ErrorMessage — validation and error messages",
  },
  placeholder: {
    value: "gray.4",
    usage: "EmptyState — empty field hints",
  },
};
