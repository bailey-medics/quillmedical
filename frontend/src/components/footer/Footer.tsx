/**
 * Footer Component Module
 *
 * Sticky footer that displays text at the bottom of the application.
 * Always visible regardless of scroll position.
 */

import { Box, Skeleton, Text, useMantineTheme } from "@mantine/core";

interface FooterProps {
  /** Text to display in the footer */
  text?: string;
  /** Whether footer is in loading state */
  loading?: boolean;
  /** Size of the footer text */
  size?: "sm" | "md" | "lg";
}

// Font size mapping (in rem)
const SIZE_MAP = {
  sm: "0.875rem",
  md: "1rem",
  lg: "1.25rem",
};

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
export default function Footer({
  text,
  loading = false,
  size = "lg",
}: FooterProps) {
  const theme = useMantineTheme();
  const fontSize = SIZE_MAP[size];

  // Don't show footer if no text provided and not loading
  if (!text && !loading) {
    return null;
  }

  return (
    <Box
      component="footer"
      pos="sticky"
      bottom={0}
      bg="white"
      style={{
        zIndex: 100,
        borderTop: `1px solid ${theme.colors.gray[2]}`,
        flexShrink: 0,
        padding: "0.5rem 1rem",
      }}
    >
      <Box style={{ display: "flex", justifyContent: "flex-end" }}>
        {loading ? (
          <Skeleton height={fontSize} width="40%" radius="sm" />
        ) : (
          <Text size={fontSize} c="gray.7">
            {text}
          </Text>
        )}
      </Box>
    </Box>
  );
}
