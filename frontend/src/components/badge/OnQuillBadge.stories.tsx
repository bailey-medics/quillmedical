/**
 * OnQuillBadge Storybook Stories
 *
 * Demonstrates the OnQuillBadge component in various sizes and states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import OnQuillBadge from "./OnQuillBadge";

const meta: Meta<typeof OnQuillBadge> = {
  title: "Badge/OnQuillBadge",
  component: OnQuillBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof OnQuillBadge>;

/** Default large size. */
export const Default: Story = {};
