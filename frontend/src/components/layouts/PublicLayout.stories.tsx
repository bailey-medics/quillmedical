import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack } from "@mantine/core";
import PublicLayout from "./PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";

const meta: Meta<typeof PublicLayout> = {
  title: "Public/Layouts/Public layout",
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
      <PublicTitle title="Welcome to Quill Medical" />
      <PublicBodyText justify="centre">
        A modern, secure platform for patients and clinics.
      </PublicBodyText>
    </Stack>
  </Container>
);

export const Default: Story = {
  args: {
    children: <SampleContent />,
  },
};
