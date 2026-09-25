/**
 * PageHeader Component
 *
 * Primary page heading (h1) with responsive sizing. Renders larger text
 * on desktop and smaller on mobile, using the sm breakpoint threshold.
 */

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
}

export default function PageHeader({
  title,
  visuallyHidden = false,
}: PageHeaderProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`);
  // The page's h1 is also its document title (WCAG 2.4.2)
  useDocumentTitle(title);

  if (visuallyHidden) {
    return (
      <VisuallyHidden>
        <Title order={1}>{title}</Title>
      </VisuallyHidden>
    );
  }

  return (
    <Box>
      <Title
        order={1}
        className={isDesktop ? classes.lgTitle : classes.smTitle}
      >
        {title}
      </Title>
    </Box>
  );
}
