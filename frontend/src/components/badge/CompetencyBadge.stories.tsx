/**
 * CompetencyBadge Storybook Stories
 *
 * Demonstrates the CompetencyBadge component with different labels
 * and the removed state.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import CompetencyBadge from "./CompetencyBadge";

const meta: Meta<typeof CompetencyBadge> = {
  title: "Badge/Competency badge",
  component: CompetencyBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof CompetencyBadge>;

/**
 * Default competency badges showing typical competency names
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <CompetencyBadge label="Take Teaching Assessments" />
      <CompetencyBadge label="Manage Teaching Content" />
      <CompetencyBadge label="View Teaching Analytics" />
    </Group>
  ),
};

/**
 * Removed competencies displayed in alert colour
 */
export const Removed: Story = {
  render: () => (
    <Group gap="md">
      <CompetencyBadge label="Take Teaching Assessments" removed />
      <CompetencyBadge label="Manage Teaching Content" removed />
    </Group>
  ),
};
