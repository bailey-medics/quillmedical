import type { Meta, StoryObj } from "@storybook/react-vite";
import HeroBackgroundLight from "./HeroBackgroundLight";
import { Container, Stack, Text, Title } from "@mantine/core";

const meta = {
  title: "Public/Background/HeroBackgroundLight",
  component: HeroBackgroundLight,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HeroBackgroundLight>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithContent: Story = {
  render: () => (
    <HeroBackgroundLight>
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
    </HeroBackgroundLight>
  ),
};
