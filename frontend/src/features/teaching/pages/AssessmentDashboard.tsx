import { Container, Stack, Title, Text } from "@mantine/core";

export default function AssessmentDashboard() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Teaching</Title>
        <Text>Select a question bank to begin an assessment.</Text>
      </Stack>
    </Container>
  );
}
