/**
 * Badge colour palette
 *
 * Centralised semantic colour tokens for all badge components.
 * Every badge must pick from this constrained set to ensure
 * consistent visual language across the application.
 */

/** Semantic badge colour names */
export type BadgeColour =
  | "success"
  | "warning"
  | "outstanding"
  | "info"
  | "neutral"
  | "accent"
  | "alert";

export type BadgeColourConfig = {
  /** Mantine background colour */
  bg: string;
  /** Text colour (white for dark backgrounds, dark for light backgrounds) */
  text: string;
};

/**
 * Maps semantic colour names to background and text colours.
 *
 * - success: green — active, completed, final, pass
 * - warning: yellow — draft, pending
 * - outstanding: pink — deactivated, cancelled, fail
 * - info: blue — upcoming, amended, admin, unread
 * - neutral: yellow — staff, default
 * - accent: violet — incomplete, special states
 * - alert: red — no-show, patient, attention needed
 */
export const badgeColours: Record<BadgeColour, BadgeColourConfig> = {
  success: { bg: "teal", text: "white" },
  warning: { bg: "cyan.6", text: "white" },
  outstanding: { bg: "pink", text: "white" },
  info: { bg: "primary", text: "white" },
  neutral: { bg: "yellow.4", text: "dark" },
  accent: { bg: "violet", text: "white" },
  alert: { bg: "red", text: "white" },
};

/** Standard variant for all badges */
export const BADGE_VARIANT = "filled" as const;
