import { Container, Stack, Title, Text } from "@mantine/core";

export default function AllResults() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>All results</Title>
        <Text>Candidate results across all question banks.</Text>
      </Stack>
    </Container>
  );
}
