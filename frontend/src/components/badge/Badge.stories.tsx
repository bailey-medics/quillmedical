/**
 * Badge Component Stories
 *
 * Demonstrates Mantine Badge component with Quill Medical theme customizations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Stack, Group, Text } from "@mantine/core";

const meta = {
  title: "Badge/Badge",
  component: Badge,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default Badge
 *
 * Shows the default themed badge (size="lg" by default).
 */
export const Default: Story = {
  args: {
    children: "Default",
  },
};

/**
 * All Sizes
 *
 * Demonstrates all badge sizes including custom xl (50% larger than lg).
 * - xs/sm: Small badges for compact displays
 * - md: Medium badges
 * - lg: Default large badges (theme default)
 * - xl: Extra large badges (custom: 50% bigger than lg, 30px mobile → 36px desktop)
 */
export const AllSizes: Story = {
  render: () => (
    <Stack gap="lg">
      <Group gap="md">
        <Badge size="xs">xs Badge</Badge>
        <Badge size="sm">sm Badge</Badge>
        <Badge size="md">md Badge</Badge>
        <Badge size="lg">lg Badge (default)</Badge>
        <Badge size="xl">xl Badge (custom)</Badge>
      </Group>
    </Stack>
  ),
};

/**
 * Permission Badges
 *
 * Demonstrates the permission badge styling used on the admin page.
 * Extra large size (xl) with filled variant and color coding.
 */
export const PermissionBadges: Story = {
  render: () => (
    <Stack gap="lg">
      <div>
        <Text size="lg" fw={500} mb="md">
          System permissions (xl size, filled variant)
        </Text>
        <Group gap="md">
          <Badge size="xl" variant="filled" color="green">
            SUPERADMIN
          </Badge>
          <Badge size="xl" variant="filled" color="blue">
            ADMIN
          </Badge>
          <Badge size="xl" variant="filled" color="gray">
            STAFF
          </Badge>
          <Badge size="xl" variant="filled" color="gray">
            PATIENT
          </Badge>
        </Group>
      </div>

      <div>
        <Text size="lg" fw={500} mb="md">
          Standard size comparison (lg, default)
        </Text>
        <Group gap="md">
          <Badge variant="filled" color="green">
            SUPERADMIN
          </Badge>
          <Badge variant="filled" color="blue">
            ADMIN
          </Badge>
          <Badge variant="filled" color="gray">
            STAFF
          </Badge>
        </Group>
      </div>
    </Stack>
  ),
};

/**
 * Variants
 *
 * Shows all badge variants with the default lg size.
 */
export const Variants: Story = {
  render: () => (
    <Group gap="md">
      <Badge variant="filled">Filled</Badge>
      <Badge variant="light">Light (default)</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="dot">Dot</Badge>
    </Group>
  ),
};

/**
 * Colors
 *
 * Demonstrates badges with different colors.
 */
export const Colors: Story = {
  render: () => (
    <Stack gap="lg">
      <Group gap="md">
        <Badge color="blue">Blue</Badge>
        <Badge color="green">Green</Badge>
        <Badge color="red">Red</Badge>
        <Badge color="yellow">Yellow</Badge>
        <Badge color="gray">Gray</Badge>
      </Group>
      <Group gap="md">
        <Badge variant="filled" color="blue">
          Blue filled
        </Badge>
        <Badge variant="filled" color="green">
          Green filled
        </Badge>
        <Badge variant="filled" color="red">
          Red filled
        </Badge>
        <Badge variant="filled" color="yellow">
          Yellow filled
        </Badge>
        <Badge variant="filled" color="gray">
          Gray filled
        </Badge>
      </Group>
    </Stack>
  ),
};

/**
 * Status Badges
 *
 * Examples of badges for conversation/task status.
 */
export const StatusBadges: Story = {
  render: () => (
    <Group gap="md">
      <Badge color="green" variant="light">
        Active
      </Badge>
      <Badge color="blue" variant="light">
        New
      </Badge>
      <Badge color="yellow" variant="light">
        Pending
      </Badge>
      <Badge color="red" variant="light">
        Closed
      </Badge>
      <Badge color="gray" variant="light">
        Archived
      </Badge>
    </Group>
  ),
};

/**
 * Competency Badges
 *
 * Examples similar to those used in NewUserPage for competencies.
 */
export const CompetencyBadges: Story = {
  render: () => (
    <Stack gap="lg">
      <div>
        <Text size="lg" fw={500} mb="md">
          Added competencies
        </Text>
        <Group gap="xs">
          <Badge variant="light" color="blue">
            Prescribing
          </Badge>
          <Badge variant="light" color="blue">
            Minor surgery
          </Badge>
          <Badge variant="light" color="blue">
            Mental health
          </Badge>
        </Group>
      </div>
      <div>
        <Text size="lg" fw={500} mb="md">
          Removed competencies
        </Text>
        <Group gap="xs">
          <Badge variant="light" color="red">
            Immunisations
          </Badge>
          <Badge variant="light" color="red">
            Child health
          </Badge>
        </Group>
      </div>
    </Stack>
  ),
};

/**
 * Unread Count Badge
 *
 * Circular badge for unread message counts.
 */
export const UnreadCount: Story = {
  render: () => (
    <Group gap="md">
      <Badge size="sm" color="red" variant="filled" circle>
        3
      </Badge>
      <Badge size="sm" color="red" variant="filled" circle>
        12
      </Badge>
      <Badge size="sm" color="red" variant="filled" circle>
        99+
      </Badge>
    </Group>
  ),
};
