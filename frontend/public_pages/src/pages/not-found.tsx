import PublicLayout from "@/components/public-layout/PublicLayout";
import { theme } from "@/theme";
import {
  Button,
  Container,
  MantineProvider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <Container size="lg" py="xl">
        <Stack align="center" style={{ paddingTop: "4rem" }}>
          <Title order={2}>404 — Page not found</Title>
          <Text c="dimmed" size="md">
            The page you requested does not exist.
          </Text>
          <Button component="a" href="/" mt="md">
            Go to home
          </Button>
        </Stack>
      </Container>
    </PublicLayout>
  </MantineProvider>,
);
