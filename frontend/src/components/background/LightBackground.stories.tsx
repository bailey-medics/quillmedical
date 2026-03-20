import type { Meta, StoryObj } from "@storybook/react-vite";
import LightBackground from "./LightBackground";
import { Container, Stack, Text, Title } from "@mantine/core";

const meta = {
  title: "Public/Background/LightBackground",
  component: LightBackground,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LightBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithContent: Story = {
  render: () => (
    <LightBackground>
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Title order={2} c="white">
            Section heading
          </Title>
          <Text c="dimmed" ta="center">
            Content on the lighter navy background.
          </Text>
        </Stack>
      </Container>
    </LightBackground>
  ),
};
