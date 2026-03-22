import { Container, Stack, Title, Text } from "@mantine/core";

export default function AssessmentResultPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Assessment result</Title>
        <Text>Your assessment results are displayed here.</Text>
      </Stack>
    </Container>
  );
}
