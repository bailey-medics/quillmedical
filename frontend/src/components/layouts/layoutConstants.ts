/**
 * Shared layout constants
 *
 * Single source of truth for spacing and sizing that all layout
 * components inherit. When adding a new layout, import these
 * values rather than defining your own.
 */

import type { MantineSpacing } from "@mantine/core";

/** Vertical padding applied above page content inside every layout. */
export const LAYOUT_PADDING_TOP: MantineSpacing = "md";

/** Vertical padding applied below page content inside every layout. */
export const LAYOUT_PADDING_BOTTOM: MantineSpacing = "xl";

/** Horizontal padding applied to the content area (0 on mobile). */
export const LAYOUT_PADDING_X: MantineSpacing = "md";

/** Width in pixels for sidebars and navigation drawers. */
export const LAYOUT_SIDEBAR_WIDTH = 260;

/** Z-index for the sticky header ribbon. */
export const LAYOUT_RIBBON_Z_INDEX = 100;
