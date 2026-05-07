/**
 * NoAccessLayout Component Stories
 *
 * Demonstrates the "no access" fallback page:
 * - Friendly welcome message
 * - Guidance to contact administrator
 * - Shown when user lacks feature access
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import NoAccessLayout from "./NoAccessLayout";

const meta: Meta<typeof NoAccessLayout> = {
  title: "Layouts/NoAccessLayout",
  component: NoAccessLayout,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof NoAccessLayout>;

/**
 * Default no-access page
 * Displays when user lacks feature access in a teaching deployment
 */
export const Default: Story = {
  args: {
    feature: "teaching",
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
