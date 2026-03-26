import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack } from "@mantine/core";
import PublicHeroBackground from "./PublicHeroBackground";
import PublicTitle from "@/components/typography/PublicTitle";

const meta: Meta<typeof PublicHeroBackground> = {
  title: "Public/Background/PublicHeroBackground",
  component: PublicHeroBackground,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof PublicHeroBackground>;

export const WithContent: Story = {
  render: () => (
    <PublicHeroBackground>
      <Container size="lg" py="xl">
        <Stack align="center" justify="center" style={{ minHeight: "60vh" }}>
          <PublicTitle
            title="Communication that *counts*!"
            description="A modern, secure platform for patients and clinics to communicate seamlessly."
            c="white"
          />
        </Stack>
      </Container>
    </PublicHeroBackground>
  ),
};
