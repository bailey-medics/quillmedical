/**
 * Footer Component Module
 *
 * Sticky footer that displays text at the bottom of the application.
 * Always visible regardless of scroll position.
 */

import { Box, Skeleton } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";

interface FooterProps {
  /** Text to display in the footer */
  text?: string;
  /** Whether footer is in loading state */
  loading?: boolean;
}

/**
 * Footer
 *
 * Renders a sticky footer bar displaying the provided text or loading indicator.
 * Hidden when no text is provided and not loading.
 *
 * @param text - Text to display in footer
 * @param loading - Whether to show loading indicator
 * @param size - Size variant (sm, md, lg)
 * @returns Footer component or null if no text and not loading
 */
export default function Footer({ text, loading = false }: FooterProps) {
  // Don't show footer if no text provided and not loading
  if (!text && !loading) {
    return null;
  }

  return (
    <Box
      component="footer"
      pos="sticky"
      bottom={0}
      bg="var(--mantine-color-body)"
      style={{
        zIndex: 100,
        borderTop: `1px solid var(--card-border, var(--mantine-color-gray-2))`,
        flexShrink: 0,
        padding: "0.5rem 1rem",
      }}
    >
      <Box style={{ display: "flex", justifyContent: "flex-end" }}>
        {loading ? (
          <Skeleton height="1.125rem" width="12rem" radius="sm" />
        ) : (
          <BodyText>{text}</BodyText>
        )}
      </Box>
    </Box>
  );
}
