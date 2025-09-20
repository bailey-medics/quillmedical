import { Button, Container, MantineProvider, Text, Title } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <Container style={{ padding: 24, textAlign: "center" }}>
      <Title order={2}>404 — Page not found</Title>
      <Text c="dimmed" size="md" style={{ marginTop: 12 }}>
        The page you requested does not exist.
      </Text>
      <Button component="a" href="/" style={{ marginTop: 20 }}>
        Go to home
      </Button>
    </Container>
  </MantineProvider>
);
