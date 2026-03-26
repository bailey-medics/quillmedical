import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicButton from "./PublicButton";
import { Box, Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import { colours } from "@/styles/colours";

const meta = {
  title: "Public/Button/PublicButton",
  component: PublicButton,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box bg={colours.navy} p="xl" c="white" display="inline-block">
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

export const Outline: Story = {
  args: {
    children: "EPR Live",
    variant: "outline",
  },
};

export const Disabled: Story = {
  args: {
    children: "Coming soon",
    disabled: true,
  },
};

export const AllSizes: Story = {
  args: { children: "" },
  render: () => (
    <VariantStack>
      <VariantRow label="sm">
        <PublicButton size="sm">Small</PublicButton>
      </VariantRow>
      <VariantRow label="md (default)">
        <PublicButton size="md">Medium</PublicButton>
      </VariantRow>
      <VariantRow label="lg">
        <PublicButton size="lg">Large</PublicButton>
      </VariantRow>
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
