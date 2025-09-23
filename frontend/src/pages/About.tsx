import { Container, Text, Title } from "@mantine/core";

export default function About() {
  return (
    <Container size="sm" pt="xl">
      <Title order={2} mb="md">
        About Quill
      </Title>
      <Text>
        FastAPI + PostgreSQL on the backend. Vite + React on the frontend. Styled with Mantine for
        clean, accessible components.
      </Text>
    </Container>
  );
}
