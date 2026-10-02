/**
 * OfficerEditModal Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import OfficerEditModal from "./OfficerEditModal";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof OfficerEditModal> = {
  title: "Safety/Officer edit modal",
  component: OfficerEditModal,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof OfficerEditModal>;

export const Default: Story = {
  args: {
    officer: SAFETY_CASES[0].officers[0],
    onClose: fn(),
    onSave: fn(),
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
