/**
 * 404 Not Found Layout Component
 *
 * Simple centered layout for 404 error pages. Displays friendly error
 * message and link back to application home, respecting SPA base URL.
 */

import { Center, Container, Stack } from "@mantine/core";
import { Heading, BodyText } from "@/components/typography";
import IconTextButton from "@/components/button/IconTextButton";

/**
 * Not Found Layout
 *
 * Renders 404 error page with message and home button. Normalizes base
 * URL from Vite environment to ensure correct navigation back to SPA root.
 *
 * @returns 404 error page layout
 */
export default function NotFoundLayout() {
  // Vite provides BASE_URL (may or may not include a trailing slash).
  // Normalize it to always include a trailing slash so an absolute
  // navigation/href goes exactly to the SPA base.
  const rawBase = (import.meta.env.BASE_URL as string) || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";

  return (
    <Container size="lg" py="xl">
      <Center mih="60vh">
        <Stack align="center" gap="lg">
          <Heading>404 — Page not found</Heading>
          <BodyText c="gray.5">The page you requested does not exist.</BodyText>
          <IconTextButton
            icon="arrowLeft"
            label="Go to home"
            onClick={() => {
              window.location.href = base;
            }}
          />
        </Stack>
      </Center>
    </Container>
  );
}
