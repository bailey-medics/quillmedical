import PublicLayout from "@/components/layouts/PublicLayout";
import { Container, List, Text, Title } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
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
  </PublicMantineProvider>,
);
