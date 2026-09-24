/**
 * FeedbackStatus Badge Storybook Stories
 *
 * Demonstrates the FeedbackStatus badge across all statuses.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { FEEDBACK_STATUSES } from "@/lib/feedback/feedbackAdmin";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

const meta: Meta<typeof FeedbackStatusBadge> = {
  title: "Badge/Feedback status badge",
  component: FeedbackStatusBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    status: {
      control: "select",
      options: [...FEEDBACK_STATUSES],
      description: "Feedback status",
    },
  },
};

export default meta;
type Story = StoryObj<typeof FeedbackStatusBadge>;

/** Shows all statuses. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {FEEDBACK_STATUSES.map((status) => (
        <FeedbackStatusBadge key={status} status={status} />
      ))}
    </Group>
  ),
};

export const Loading: Story = {
  args: { status: "new", isLoading: true },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
