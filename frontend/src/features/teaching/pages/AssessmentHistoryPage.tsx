import { Container, Stack, Title, Text } from "@mantine/core";

export default function AssessmentHistoryPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Assessment history</Title>
        <Text>Your past assessment attempts.</Text>
      </Stack>
    </Container>
  );
}
