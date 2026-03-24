/**
 * HeaderText Storybook Stories
 *
 * Demonstrates the HeaderText component — bold, prominent text
 * for card titles and section headings.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import HeaderText from "./HeaderText";

const meta = {
  title: "Typography/HeaderText",
  component: HeaderText,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof HeaderText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default header text */
export const Default: Story = {
  args: {
    children: "Patient demographics",
  },
};
