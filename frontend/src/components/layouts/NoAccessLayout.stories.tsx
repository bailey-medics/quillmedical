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
  title: "Layouts/No access layout",
  component: NoAccessLayout,
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

/**
 * No feature at all
 * Displays at `/` when the first link in the side navigation would be
 * Settings, because the account reaches no feature
 */
export const NoFeatures: Story = {
  args: {
    feature: undefined,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
