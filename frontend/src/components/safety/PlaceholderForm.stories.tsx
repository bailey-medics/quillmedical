/**
 * PlaceholderForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PlaceholderForm from "./PlaceholderForm";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof PlaceholderForm> = {
  title: "Safety/Placeholder form",
  component: PlaceholderForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PlaceholderForm>;

export const Default: Story = {
  args: {
    placeholders: SAFETY_CASES[0].placeholders,
    onSave: fn(),
    onCancel: fn(),
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
