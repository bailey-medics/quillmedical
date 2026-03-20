import type { Meta, StoryObj } from "@storybook/react-vite";
import DarkBackground from "./DarkBackground";
import { Container, Stack, Text, Title } from "@mantine/core";

const meta = {
  title: "Public/Background/DarkBackground",
  component: DarkBackground,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DarkBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithContent: Story = {
  args: { children: undefined },
  render: () => (
    <DarkBackground>
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Title order={2} c="white">
            Section heading
          </Title>
          <Text c="dimmed" ta="center">
            Content on the dark navy background.
          </Text>
        </Stack>
      </Container>
    </DarkBackground>
  ),
};
