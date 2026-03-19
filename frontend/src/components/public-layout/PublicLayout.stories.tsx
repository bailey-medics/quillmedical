import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack, Text, Title } from "@mantine/core";
import PublicLayout from "./PublicLayout";

const meta: Meta<typeof PublicLayout> = {
  title: "Layouts/PublicLayout",
  component: PublicLayout,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PublicLayout>;

export const Default: Story = {
  args: {
    children: (
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
          <Title order={1}>Welcome to Quill Medical</Title>
          <Text size="lg" ta="center">
            A modern, secure platform for patients and clinics.
          </Text>
        </Stack>
      </Container>
    ),
  },
};

export const CustomSignInUrl: Story = {
  args: {
    signInUrl: "https://app.quill-medical.com/",
    children: (
      <Container size="lg" py="xl">
        <Title order={1}>Public site</Title>
        <Text>Sign in link points to the production app domain.</Text>
      </Container>
    ),
  },
};

export const MinimalContent: Story = {
  args: {
    children: (
      <Container size="lg" py="xl">
        <Text>404 — Page not found</Text>
      </Container>
    ),
  },
};
