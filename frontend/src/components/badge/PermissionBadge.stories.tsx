/**
 * PermissionBadge Storybook Stories
 *
 * Demonstrates the PermissionBadge component with different permission levels,
 * sizes, and variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import PermissionBadge from "./PermissionBadge";

const meta: Meta<typeof PermissionBadge> = {
  title: "Badge/PermissionBadge",
  component: PermissionBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof PermissionBadge>;

/**
 * Default PermissionBadge
 *
 * Shows the default superadmin permission badge with lg size and filled variant.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <PermissionBadge permission="superadmin" />
      <PermissionBadge permission="admin" />
      <PermissionBadge permission="staff" />
    </Group>
  ),
};
