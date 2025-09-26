import { Button, Container, Text, Title } from "@mantine/core";

export default function NotFoundLayout() {
  // Vite provides BASE_URL (may or may not include a trailing slash).
  // Normalize it to always include a trailing slash so an absolute
  // navigation/href goes exactly to the SPA base (e.g. '/app/').
  const rawBase = (import.meta.env.BASE_URL as string) || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";

  return (
    <Container style={{ padding: 24, textAlign: "center" }}>
      <Title order={2}>404 — Page not found</Title>
      <Text c="dimmed" size="md" style={{ marginTop: 12 }}>
        The page you requested does not exist.
      </Text>
      <Button component="a" href={base} style={{ marginTop: 20 }}>
        Go to home
      </Button>
    </Container>
  );
}
