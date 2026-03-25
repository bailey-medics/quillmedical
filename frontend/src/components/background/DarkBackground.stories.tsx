import type { Meta, StoryObj } from "@storybook/react-vite";
import DarkBackground from "./DarkBackground";
import { Container, Stack } from "@mantine/core";
import PublicTitle from "@/components/typography/PublicTitle";

const meta = {
  title: "Public/Background/DarkBackground",
  component: DarkBackground,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DarkBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {
  args: { children: undefined },
  render: () => (
    <DarkBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <PublicTitle
            title="Communication that *counts*!"
            description="A modern, secure platform for patients and clinics to communicate seamlessly."
            c="white"
          />
        </Stack>
      </Container>
    </DarkBackground>
  ),
};
