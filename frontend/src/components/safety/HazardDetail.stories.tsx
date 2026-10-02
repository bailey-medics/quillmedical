/**
 * HazardDetail Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import HazardDetail from "./HazardDetail";
import { SAFETY_CASES } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];

function args(hazardId: string) {
  const hazard = safetyCase.hazards.find((h) => h.id === hazardId)!;
  return {
    hazard,
    incidents: safetyCase.incidents.filter((i) => i.hazard_id === hazardId),
    onSelectIncident: fn(),
  };
}

const meta: Meta<typeof HazardDetail> = {
  title: "Safety/Hazard detail",
  component: HazardDetail,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof HazardDetail>;

export const OpenWithIncident: Story = { args: args("H-02") };
export const MitigatedNoIncidents: Story = { args: args("H-01") };
export const Closed: Story = { args: args("H-03") };

export const DarkMode: Story = {
  ...OpenWithIncident,
  globals: { colorScheme: "dark" },
};
