/**
 * IncidentTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import IncidentTable from "./IncidentTable";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof IncidentTable> = {
  title: "Safety/Incident table",
  component: IncidentTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof IncidentTable>;

export const Default: Story = {
  args: { incidents: SAFETY_CASES[0].incidents, onSelect: fn() },
};

export const Empty: Story = {
  args: { incidents: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
