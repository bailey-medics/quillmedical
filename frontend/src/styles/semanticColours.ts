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
    usage: "BodyTextMuted, BodyTextClamp — secondary body text",
  },
  emphasis: {
    value: "black",
    usage: "BodyTextInline, BodyTextBold — inline and emphasised body text",
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
