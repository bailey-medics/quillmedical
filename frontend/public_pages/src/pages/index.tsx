import QuillLogo from "@/components/images/QuillLogo";
import {
  Button,
  Container,
  Group,
  MantineProvider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <Container size="lg" py="xl">
      <Stack align="center" justify="center" style={{ minHeight: "70dvh" }}>
        <QuillLogo height={8} />
        <Title order={1}>Welcome to Quill Medical</Title>
        <Text size="lg" ta="center">
          Quill is a modern, secure platform for patients and clinics to
          communicate seamlessly. Send messages, receive expert responses, and
          get professional clinical letters—all with transparent billing and
          secure records using healthcare standards (FHIR and OpenEHR). Designed
          for fairness, privacy, and future-ready electronic patient records.
        </Text>
        <Text size="md" ta="center" c="dimmed">
          Whether you're a patient seeking care or a clinic managing
          communications, Quill ensures secure, auditable interactions with fair
          pricing based on clinician time.
        </Text>
        <Group mt="lg">
          <Button component="a" href="/app/" size="md">
            Sign in / register
          </Button>
          <Button
            variant="outline"
            component="a"
            href="/features.html"
            size="md"
          >
            Features
          </Button>
        </Group>
      </Stack>
    </Container>
  </MantineProvider>,
);
