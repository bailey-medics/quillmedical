/**
 * PageHeader Component
 *
 * Primary page heading (h1) with responsive sizing. Renders larger text
 * on desktop and smaller on mobile, using the sm breakpoint threshold.
 *
 * Carries the page's header action too, when it has one: an "Add" button,
 * a badge. The action sits on the right, and stays on the right when a
 * narrow screen wraps it under the title. A `Group` with
 * `justify="space-between"` did not: a wrapped item is alone on its line,
 * so there is nothing to space it against and it fell to the left.
 */

import type { ReactNode } from "react";
import { Box, Title, VisuallyHidden, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useDocumentTitle } from "@lib/accessibility/useDocumentTitle";
import classes from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: string;
  /**
   * Keep the h1 for screen readers but do not show it. For pages whose
   * content already makes the title obvious to a sighted reader (a
   * patient's record, a message thread), but which still need one h1
   * for a screen reader user navigating by heading.
   */
  visuallyHidden?: boolean;
  /**
   * The page's header action, shown on the right of the title, and on
   * the right of its own line when the screen is too narrow for both.
   */
  action?: ReactNode;
  /**
   * How the action lines up with the title. `end` (the default) sits a
   * button on the title's baseline; `center` suits something shorter
   * than the title, such as a badge.
   */
  actionAlign?: "end" | "center";
}

export default function PageHeader({
  title,
  visuallyHidden = false,
  action,
  actionAlign = "end",
}: PageHeaderProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`);
  // The page's h1 is also its document title (WCAG 2.4.2)
  useDocumentTitle(title);

  const heading = visuallyHidden ? (
    <VisuallyHidden>
      <Title order={1}>{title}</Title>
    </VisuallyHidden>
  ) : (
    <Title order={1} className={isDesktop ? classes.lgTitle : classes.smTitle}>
      {title}
    </Title>
  );

  if (!action) {
    return visuallyHidden ? heading : <Box>{heading}</Box>;
  }

  return (
    <Box className={classes.row} data-align={actionAlign}>
      {heading}
      <Box className={classes.action}>{action}</Box>
    </Box>
  );
}
