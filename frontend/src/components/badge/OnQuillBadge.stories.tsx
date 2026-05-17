/**
 * OnQuillBadge Storybook Stories
 *
 * Demonstrates the OnQuillBadge component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import OnQuillBadge from "./OnQuillBadge";

const meta: Meta<typeof OnQuillBadge> = {
  title: "Badge/On Quill badge",
  component: OnQuillBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof OnQuillBadge>;

/** Default badge. */
export const Default: Story = {};
