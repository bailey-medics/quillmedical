/**
 * AssessmentResultBadge Storybook Stories
 *
 * Demonstrates the AssessmentResultBadge component in all result states
 * and size variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import AssessmentResultBadge from "./AssessmentResultBadge";

const meta: Meta<typeof AssessmentResultBadge> = {
  title: "Badge/AssessmentResultBadge",
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
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentResultBadge>;

/**
 * Shows all three result states with default size.
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
