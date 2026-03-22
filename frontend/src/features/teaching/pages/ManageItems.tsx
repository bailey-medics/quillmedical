import { Container, Stack, Title, Text } from "@mantine/core";

export default function ManageItems() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>Manage items</Title>
        <Text>Question bank item management and sync.</Text>
      </Stack>
    </Container>
  );
}
