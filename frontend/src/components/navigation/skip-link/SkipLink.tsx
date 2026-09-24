/**
 * Skip link, and the target it skips to.
 *
 * The first thing a keyboard user tabs to on every page: a link, hidden
 * until it has focus, that jumps past the ribbon and navigation to the
 * page's own content (WCAG 2.4.1 Bypass blocks). Each layout renders
 * `SkipLink` first and wraps its content in `SkipLinkTarget`.
 *
 * The target sits inside `main`, not on it. `main` is the layouts'
 * scroll container, and once focus is inside it the arrow keys and
 * Space scroll it, including in Safari, which does not make a scroll
 * container focusable by itself. Leaving `main` without a tabindex keeps
 * Chrome's and Firefox's own keyboard scrolling of it working as well.
 */

import { Anchor, Box } from "@mantine/core";
import type { MouseEvent, ReactNode } from "react";
import classes from "./SkipLink.module.css";

/** The id of the element the skip link moves focus to. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Move focus to the main content, rather than only changing the URL
 * hash: a hash alone does not move focus in every browser, and would
 * let the router treat it as navigation.
 */
function skipToContent(event: MouseEvent<HTMLAnchorElement>): void {
  const target = document.getElementById(MAIN_CONTENT_ID);
  if (!target) return;
  event.preventDefault();
  target.focus();
}

/**
 * "Skip to main content", visible only when focused.
 *
 * @returns The skip link
 */
export function SkipLink() {
  return (
    <Anchor
      href={`#${MAIN_CONTENT_ID}`}
      className={classes.link}
      onClick={skipToContent}
    >
      Skip to main content
    </Anchor>
  );
}

export interface SkipLinkTargetProps {
  /** The page content the skip link lands on */
  children: ReactNode;
}

/**
 * Wraps a layout's content as the skip link's destination. Focusable by
 * script only (tabIndex -1), so it adds no tab stop of its own.
 *
 * @returns The focusable wrapper
 */
export function SkipLinkTarget({ children }: SkipLinkTargetProps) {
  return (
    <Box id={MAIN_CONTENT_ID} tabIndex={-1} className={classes.target}>
      {children}
    </Box>
  );
}
