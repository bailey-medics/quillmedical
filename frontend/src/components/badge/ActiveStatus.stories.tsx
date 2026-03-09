/**
 * ActiveStatus Badge Storybook Stories
 *
 * Demonstrates the ActiveStatus component in various states and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Group, Text } from "@mantine/core";
import ActiveStatus from "./ActiveStatus";

const meta: Meta<typeof ActiveStatus> = {
  title: "Badge/ActiveStatus",
  component: ActiveStatus,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
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
type Story = StoryObj<typeof ActiveStatus>;

/**
 * Default States
 *
 * Shows both active and deactivated states with default medium size.
 */
export const DefaultStates: Story = {
  render: () => (
    <Group gap="md">
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Active
        </Text>
        <ActiveStatus active={true} />
      </div>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Deactivated
        </Text>
        <ActiveStatus active={false} />
      </div>
    </Group>
  ),
};

/**
 * All Sizes Comparison
 *
 * Shows all size variants side by side for comparison.
 */
export const AllSizes: Story = {
  render: () => (
    <Stack gap="lg">
      <div>
        <Text size="sm" fw={500} mb="xs">
          Active status - all sizes
        </Text>
        <Group gap="md">
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              sm
            </Text>
            <ActiveStatus active={true} size="sm" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              md (default)
            </Text>
            <ActiveStatus active={true} size="md" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              lg
            </Text>
            <ActiveStatus active={true} size="lg" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              xl
            </Text>
            <ActiveStatus active={true} size="xl" />
          </div>
        </Group>
      </div>

      <div>
        <Text size="sm" fw={500} mb="xs">
          Deactivated status - all sizes
        </Text>
        <Group gap="md">
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              sm
            </Text>
            <ActiveStatus active={false} size="sm" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              md (default)
            </Text>
            <ActiveStatus active={false} size="md" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              lg
            </Text>
            <ActiveStatus active={false} size="lg" />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              xl
            </Text>
            <ActiveStatus active={false} size="xl" />
          </div>
        </Group>
      </div>
    </Stack>
  ),
};
