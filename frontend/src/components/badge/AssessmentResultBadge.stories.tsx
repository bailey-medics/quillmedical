/**
 * AssessmentResultBadge Storybook Stories
 *
 * Demonstrates the AssessmentResultBadge component in all result states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import AssessmentResultBadge from "./AssessmentResultBadge";

const meta: Meta<typeof AssessmentResultBadge> = {
  title: "Badge/Assessment result badge",
  component: AssessmentResultBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    result: {
      control: "select",
      options: ["pass", "fail", "incomplete"],
      description: "Assessment result",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentResultBadge>;

/**
 * Shows all three result states.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <AssessmentResultBadge result="pass" />
      <AssessmentResultBadge result="fail" />
      <AssessmentResultBadge result="incomplete" />
    </Group>
  ),
};
