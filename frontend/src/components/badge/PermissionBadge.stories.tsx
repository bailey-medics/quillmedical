/**
 * PermissionBadge Storybook Stories
 *
 * Demonstrates the PermissionBadge component with different permission levels,
 * sizes, and variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Group, Container } from "@mantine/core";
import PermissionBadge from "./PermissionBadge";

const meta: Meta<typeof PermissionBadge> = {
  title: "Badge/PermissionBadge",
  component: PermissionBadge,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PermissionBadge>;

/**
 * Default PermissionBadge
 *
 * Shows the default superadmin permission badge with xl size and filled variant.
 */
export const Default: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="xl" />
            <PermissionBadge permission="admin" size="xl" />
            <PermissionBadge permission="staff" size="xl" />
          </Group>
        </div>
      </Stack>
    </Container>
  ),
};

/**
 * Size Variants
 *
 * Shows permission badges in different sizes: xs, sm, md, lg, xl.
 */
export const SizeVariants: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="xs" />
            <PermissionBadge permission="admin" size="xs" />
            <PermissionBadge permission="staff" size="xs" />
          </Group>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>xs</div>
        </div>
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="sm" />
            <PermissionBadge permission="admin" size="sm" />
            <PermissionBadge permission="staff" size="sm" />
          </Group>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>sm</div>
        </div>
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="md" />
            <PermissionBadge permission="admin" size="md" />
            <PermissionBadge permission="staff" size="md" />
          </Group>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>md</div>
        </div>
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="lg" />
            <PermissionBadge permission="admin" size="lg" />
            <PermissionBadge permission="staff" size="lg" />
          </Group>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>lg</div>
        </div>
        <div>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="xl" />
            <PermissionBadge permission="admin" size="xl" />
            <PermissionBadge permission="staff" size="xl" />
          </Group>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            xl (default)
          </div>
        </div>
      </Stack>
    </Container>
  ),
};

/**
 * Loading state with skeleton placeholders at each size.
 */
export const Loading: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <PermissionBadge permission="superadmin" size="xs" isLoading />
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>xs</div>
        </div>
        <div>
          <PermissionBadge permission="superadmin" size="sm" isLoading />
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>sm</div>
        </div>
        <div>
          <PermissionBadge permission="superadmin" size="md" isLoading />
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>md</div>
        </div>
        <div>
          <PermissionBadge permission="superadmin" size="lg" isLoading />
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>lg</div>
        </div>
        <div>
          <PermissionBadge permission="superadmin" size="xl" isLoading />
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            xl (default)
          </div>
        </div>
      </Stack>
    </Container>
  ),
};
