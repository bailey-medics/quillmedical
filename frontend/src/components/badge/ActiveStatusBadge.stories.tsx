/**
 * ActiveStatus Badge Storybook Stories
 *
 * Demonstrates the ActiveStatus component in various states and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import ActiveStatusBadge from "./ActiveStatusBadge";

const meta: Meta<typeof ActiveStatusBadge> = {
  title: "Badge/ActiveStatusBadge",
  component: ActiveStatusBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    active: {
      control: "boolean",
      description: "Whether the resource is active",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof ActiveStatusBadge>;

/**
 * Shows both active and deactivated states with default large size.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <ActiveStatusBadge active={true} />
      <ActiveStatusBadge active={false} />
    </Group>
  ),
};
