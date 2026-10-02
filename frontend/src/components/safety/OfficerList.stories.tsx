/**
 * OfficerList Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import OfficerList from "./OfficerList";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof OfficerList> = {
  title: "Safety/Officer list",
  component: OfficerList,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof OfficerList>;

export const Default: Story = {
  args: { officers: SAFETY_CASES[0].officers },
};

export const Editable: Story = {
  args: { officers: SAFETY_CASES[0].officers, onEdit: fn() },
};

export const Empty: Story = {
  args: { officers: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
