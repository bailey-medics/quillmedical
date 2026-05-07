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
 * in theme.ts via cssVariablesResolver. These are identical in light and
 * dark modes — they are used as filled backgrounds with white/dark text.
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
    bg: "var(--success-color)",
    text: "white",
    usage: "Active, completed, final, pass",
  },
  warning: {
    bg: "var(--warning-color)",
    text: "white",
    usage: "Draft, pending",
  },
  outstanding: {
    bg: "var(--outstanding-color)",
    text: "white",
    usage: "Deactivated, cancelled, fail",
  },
  info: {
    bg: "var(--info-color)",
    text: "white",
    usage: "Upcoming, amended, admin, unread",
  },
  neutral: {
    bg: "var(--neutral-color)",
    text: "dark",
    usage: "Staff, default",
  },
  accent: {
    bg: "var(--accent-color)",
    text: "white",
    usage: "Incomplete, special states",
  },
  alert: {
    bg: "var(--alert-color)",
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
