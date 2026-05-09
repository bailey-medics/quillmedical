import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicButton from "./PublicButton";
import { Box, Group } from "@mantine/core";
import { StoryNote, VariantStack } from "@/stories/variants";

const meta = {
  title: "Public/Button/PublicButton",
  component: PublicButton,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box bg="var(--mantine-color-primary-8)" p="xl" c="white" mih="100vh">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PublicButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Get started",
  },
};

export const AllSizes: Story = {
  args: { children: "" },
  render: () => (
    <VariantStack>
      <div>
        <PublicButton size="sm">Small</PublicButton>
        <StoryNote mt="xs">sm</StoryNote>
      </div>
      <div>
        <PublicButton size="md">Medium</PublicButton>
        <StoryNote mt="xs">md (default)</StoryNote>
      </div>
      <div>
        <PublicButton size="lg">Large</PublicButton>
        <StoryNote mt="xs">lg</StoryNote>
      </div>
    </VariantStack>
  ),
};

export const AllVariants: Story = {
  args: { children: "" },
  render: () => (
    <Group>
      <PublicButton>Filled</PublicButton>
      <PublicButton variant="outline">Outline</PublicButton>
      <PublicButton disabled>Disabled</PublicButton>
      <PublicButton variant="outline" disabled>
        Outline disabled
      </PublicButton>
    </Group>
  ),
};
