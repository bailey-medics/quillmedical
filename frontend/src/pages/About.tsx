/**
 * About Page Module
 *
 * Simple informational page describing the Quill Medical application's
 * technology stack and architecture.
 */

import { Container, Text, Title } from "@mantine/core";

/**
 * About Page
 *
 * Displays information about the Quill Medical application, including
 * the technology stack (FastAPI, PostgreSQL, Vite, React, Mantine).
 *
 * @returns About page component
 */
export default function About() {
  return (
    <Container size="sm" pt="xl">
      <Title order={2} mb="md">
        About Quill
      </Title>
      <Text>
        FastAPI + PostgreSQL on the backend. Vite + React on the frontend.
        Styled with Mantine for clean, accessible components.
      </Text>
    </Container>
  );
}
