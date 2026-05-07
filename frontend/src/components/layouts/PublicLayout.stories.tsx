import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack, Text, Title } from "@mantine/core";
import PublicLayout from "./PublicLayout";

const meta: Meta<typeof PublicLayout> = {
  title: "Public/Layouts/PublicLayout",
  component: PublicLayout,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof PublicLayout>;

const SampleContent = () => (
  <Container size="lg" py="xl">
    <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
      <Title order={1} c="#fff">
        Welcome to Quill Medical
      </Title>
      <Text size="lg" ta="center" c="dimmed">
        A modern, secure platform for patients and clinics.
      </Text>
    </Stack>
  </Container>
);

export const Default: Story = {
  args: {
    children: <SampleContent />,
  },
};
