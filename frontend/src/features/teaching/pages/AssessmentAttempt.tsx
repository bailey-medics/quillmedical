import { Container, Stack, Title, Text } from "@mantine/core";

export default function AssessmentAttempt() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Assessment</Title>
        <Text>Assessment in progress.</Text>
      </Stack>
    </Container>
  );
}
