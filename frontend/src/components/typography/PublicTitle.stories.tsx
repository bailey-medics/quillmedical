import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicTitle from "./PublicTitle";
import { Box } from "@mantine/core";
import { colours } from "@/styles/colours";

const meta = {
  title: "Public/Typography/PublicTitle",
  component: PublicTitle,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box maw={800} bg={colours.navy} p="xl">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PublicTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Communication that Counts!",
  },
};

export const WithAccent: Story = {
  args: {
    title: "Communication that *counts*!",
    c: "white",
  },
};

export const WithDescription: Story = {
  args: {
    title: "Communication that Counts!",
    description:
      "A modern, secure platform for patients and clinics to communicate seamlessly.",
  },
};

export const MediumSize: Story = {
  args: {
    title: "Our features",
    size: "md",
  },
};

export const SmallSize: Story = {
  args: {
    title: "Get started today",
    size: "sm",
  },
};

export const LeftAligned: Story = {
  args: {
    title: "Communication that Counts!",
    description: "Left-aligned variant for alternative layouts.",
    ta: "left",
  },
};
