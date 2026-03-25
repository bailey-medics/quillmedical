import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack, Text, Title } from "@mantine/core";
import HeroBackground from "./HeroBackground";

const meta: Meta<typeof HeroBackground> = {
  title: "Public/Background/HeroBackground",
  component: HeroBackground,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof HeroBackground>;

export const Default: Story = {};

export const WithContent: Story = {
  render: () => (
    <HeroBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <Title order={1} c="white">
            Welcome to Quill Medical
          </Title>
          <Text c="dimmed" ta="center" size="lg">
            A modern, secure platform for patients and clinics.
          </Text>
        </Stack>
      </Container>
    </HeroBackground>
  ),
};
