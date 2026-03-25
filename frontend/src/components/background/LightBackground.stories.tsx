import type { Meta, StoryObj } from "@storybook/react-vite";
import LightBackground from "./LightBackground";
import { Container, Stack } from "@mantine/core";
import PublicTitle from "@/components/typography/PublicTitle";

const meta = {
  title: "Public/Background/LightBackground",
  component: LightBackground,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LightBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {
  render: () => (
    <LightBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <PublicTitle
            title="Communication that *counts*!"
            description="A modern, secure platform for patients and clinics to communicate seamlessly."
            c="white"
          />
        </Stack>
      </Container>
    </LightBackground>
  ),
};
