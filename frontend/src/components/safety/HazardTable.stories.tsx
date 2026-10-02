/**
 * HazardTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import HazardTable from "./HazardTable";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof HazardTable> = {
  title: "Safety/Hazard table",
  component: HazardTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof HazardTable>;

export const Default: Story = {
  args: { hazards: SAFETY_CASES[0].hazards },
};

export const Empty: Story = {
  args: { hazards: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
