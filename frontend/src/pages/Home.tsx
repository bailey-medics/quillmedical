import QuillLogo from "@/components/images/QuillLogo";
import { Button, Group, Stack, Text, Title } from "@mantine/core";

export default function Home() {
  return (
    <Stack
      align="center"
      justify="center"
      style={{ minHeight: "70vh", padding: "2rem", margin: "0 auto" }}
    >
      <QuillLogo height={128} />
      <Title order={1}>Welcome to Quill Medical</Title>
      <Text size="lg" ta="center">
        Quill is a modern, secure platform for patients and clinics to
        communicate seamlessly. Send messages, receive expert responses, and get
        professional clinical letters—all with transparent billing and
        tamper-evident records stored in dedicated Git repositories. Designed
        for fairness, privacy, and future-ready electronic patient records.
      </Text>
      <Text size="md" ta="center" c="dimmed">
        Whether you're a patient seeking care or a clinic managing
        communications, Quill ensures secure, auditable interactions with fair
        pricing based on clinician time.
      </Text>
      <Group mt="lg">
        <Button size="md">Get Started</Button>
        <Button variant="outline" size="md">
          Learn More
        </Button>
      </Group>
    </Stack>
  );
}
