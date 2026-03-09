/**
 * PermissionBadge Storybook Stories
 *
 * Demonstrates the PermissionBadge component with different permission levels,
 * sizes, and variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Group, Text, Container } from "@mantine/core";
import PermissionBadge from "./PermissionBadge";

const meta: Meta<typeof PermissionBadge> = {
  title: "Badge/PermissionBadge",
  component: PermissionBadge,
  parameters: {
    layout: "centered",
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
  args: {
    permission: "superadmin",
  },
};

/**
 * All Permission Levels
 *
 * Displays all three permission levels (superadmin, admin, staff) with their
 * corresponding color schemes.
 */
export const AllPermissionLevels: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Superadmin (Green)
          </Text>
          <PermissionBadge permission="superadmin" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Admin (Blue)
          </Text>
          <PermissionBadge permission="admin" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Staff (Gray)
          </Text>
          <PermissionBadge permission="staff" />
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
          <Text size="sm" fw={500} mb="xs">
            XS Size
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="xs" />
            <PermissionBadge permission="admin" size="xs" />
            <PermissionBadge permission="staff" size="xs" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            SM Size
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="sm" />
            <PermissionBadge permission="admin" size="sm" />
            <PermissionBadge permission="staff" size="sm" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            MD Size
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="md" />
            <PermissionBadge permission="admin" size="md" />
            <PermissionBadge permission="staff" size="md" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            LG Size
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" size="lg" />
            <PermissionBadge permission="admin" size="lg" />
            <PermissionBadge permission="staff" size="lg" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            XL Size (Default)
          </Text>
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
 * Display Variants
 *
 * Shows permission badges in different display variants: filled, light, outline.
 */
export const DisplayVariants: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Filled (Default)
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" variant="filled" />
            <PermissionBadge permission="admin" variant="filled" />
            <PermissionBadge permission="staff" variant="filled" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Light
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" variant="light" />
            <PermissionBadge permission="admin" variant="light" />
            <PermissionBadge permission="staff" variant="light" />
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Outline
          </Text>
          <Group gap="md">
            <PermissionBadge permission="superadmin" variant="outline" />
            <PermissionBadge permission="admin" variant="outline" />
            <PermissionBadge permission="staff" variant="outline" />
          </Group>
        </div>
      </Stack>
    </Container>
  ),
};

/**
 * In Context
 *
 * Shows how permission badges appear in typical usage scenarios like
 * admin pages and user lists.
 */
export const InContext: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Text size="lg" fw={500} mb="xs">
            Admin Page Header
          </Text>
          <Group>
            <Text size="xl" fw={700}>
              Administration
            </Text>
            <PermissionBadge permission="superadmin" />
          </Group>
        </div>
        <div>
          <Text size="lg" fw={500} mb="xs">
            User Profile Card
          </Text>
          <Group justify="space-between">
            <div>
              <Text fw={500}>John Doe</Text>
              <Text size="sm" c="dimmed">
                john.doe@example.com
              </Text>
            </div>
            <PermissionBadge permission="admin" variant="light" />
          </Group>
        </div>
      </Stack>
    </Container>
  ),
};
