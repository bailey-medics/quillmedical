import PublicLayout from "@/components/layouts/PublicLayout";
import { theme } from "@/theme";
import { Container, List, MantineProvider, Text, Title } from "@mantine/core";
import "../global-styles";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <Container size="lg" py="xl">
        <Title order={1}>Features</Title>
        <List mt="md" size="md">
          <List.Item>Clinician-first workflows</List.Item>
          <List.Item>Git-backed history</List.Item>
          <List.Item>Argon2 password hashing</List.Item>
        </List>
        <Text mt="lg">
          <a href="/">← Back home</a>
        </Text>
      </Container>
    </PublicLayout>
  </MantineProvider>,
);
