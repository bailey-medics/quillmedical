/**
 * IncidentReport Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import IncidentReport from "./IncidentReport";
import { SAFETY_CASES, hazardById } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];

function args(index: number) {
  const incident = safetyCase.incidents[index];
  return {
    incident,
    hazard: hazardById(safetyCase, incident.hazard_id),
    hazardHref: `/safety/${safetyCase.id}/hazards/${incident.hazard_id}`,
  };
}

const meta: Meta<typeof IncidentReport> = {
  title: "Safety/Incident report",
  component: IncidentReport,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof IncidentReport>;

export const Moderate: Story = { args: args(0) };
export const High: Story = { args: args(1) };

export const DarkMode: Story = {
  ...High,
  globals: { colorScheme: "dark" },
};
