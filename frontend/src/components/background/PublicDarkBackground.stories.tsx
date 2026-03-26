import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicDarkBackground from "./PublicDarkBackground";
import { Container, Stack } from "@mantine/core";
import PublicTitle from "@/components/typography/PublicTitle";

const meta = {
  title: "Public/Background/PublicDarkBackground",
  component: PublicDarkBackground,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PublicDarkBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {
  args: { children: undefined },
  render: () => (
    <PublicDarkBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <PublicTitle
            title="Communication that *counts*!"
            description="A modern, secure platform for patients and clinics to communicate seamlessly."
            c="white"
          />
        </Stack>
      </Container>
    </PublicDarkBackground>
  ),
};
