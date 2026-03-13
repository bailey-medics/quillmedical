/**
 * AddButton Storybook Stories
 *
 * Demonstrates the AddButton component with different labels and states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import AddButton from "./AddButton";

const meta: Meta<typeof AddButton> = {
  title: "Button/AddButton",
  component: AddButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddButton>;

/**
 * Default AddButton
 *
 * Shows the default add button with "Add user" label at large size.
 */
export const Default: Story = {
  args: {
    label: "Add user",
  },
};
