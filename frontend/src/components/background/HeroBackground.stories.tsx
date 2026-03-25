import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack } from "@mantine/core";
import HeroBackground from "./HeroBackground";
import PublicTitle from "@/components/typography/PublicTitle";

const meta: Meta<typeof HeroBackground> = {
  title: "Public/Background/HeroBackground",
  component: HeroBackground,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof HeroBackground>;

export const WithContent: Story = {
  render: () => (
    <HeroBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <PublicTitle
            title="Communication that *counts*!"
            description="A modern, secure platform for patients and clinics to communicate seamlessly."
            c="white"
          />
        </Stack>
      </Container>
    </HeroBackground>
  ),
};
