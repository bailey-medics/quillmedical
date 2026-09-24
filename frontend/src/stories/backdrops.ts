/**
 * Storybook backdrop styles, for stories whose component sits on a
 * coloured surface rather than the page.
 */

import type { CSSProperties } from "react";

/**
 * Style for a story backdrop in the brand navy.
 *
 * Variant labels are `dimmed` text, which the theme darkens in light
 * mode; on a navy backdrop that is unreadable, so the backdrop swaps in
 * the dark-mode dimmed colour whatever the scheme.
 */
export const NAVY_BACKDROP: CSSProperties = {
  background: "var(--brand-primary)",
  ["--mantine-color-dimmed" as string]: "var(--mantine-color-primary-1)",
};
