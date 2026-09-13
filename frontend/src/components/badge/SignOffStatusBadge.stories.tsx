/**
 * SignOffStatusBadge Storybook Stories
 *
 * Demonstrates the SignOffStatusBadge component in all four states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import SignOffStatusBadge from "./SignOffStatusBadge";

const meta: Meta<typeof SignOffStatusBadge> = {
  title: "Badge/Sign-off status badge",
  component: SignOffStatusBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["requested", "signed_off", "declined", "superseded"],
      description: "Where the sign-off stands",
    },
  },
};

export default meta;
type Story = StoryObj<typeof SignOffStatusBadge>;

/**
 * Shows all four sign-off states.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <SignOffStatusBadge status="requested" />
      <SignOffStatusBadge status="signed_off" />
      <SignOffStatusBadge status="declined" />
      <SignOffStatusBadge status="superseded" />
    </Group>
  ),
};
