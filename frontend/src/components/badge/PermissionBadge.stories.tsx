/**
 * PermissionBadge Storybook Stories
 *
 * Demonstrates the PermissionBadge component with different permission levels
 * and variants.
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
 * Shows all permission levels with filled variant.
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
