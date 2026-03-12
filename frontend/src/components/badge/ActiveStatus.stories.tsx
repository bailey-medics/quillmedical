/**
 * ActiveStatus Badge Storybook Stories
 *
 * Demonstrates the ActiveStatus component in various states and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
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
 * Shows both active and deactivated states with default medium size.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <ActiveStatus active={true} />
      <ActiveStatus active={false} />
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <div>
        <Group gap="md">
          <ActiveStatus active={true} size="sm" />
          <ActiveStatus active={false} size="sm" />
        </Group>
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>sm</div>
      </div>
      <div>
        <Group gap="md">
          <ActiveStatus active={true} size="md" />
          <ActiveStatus active={false} size="md" />
        </Group>
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          md (default)
        </div>
      </div>
      <div>
        <Group gap="md">
          <ActiveStatus active={true} size="lg" />
          <ActiveStatus active={false} size="lg" />
        </Group>
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>lg</div>
      </div>
      <div>
        <Group gap="md">
          <ActiveStatus active={true} size="xl" />
          <ActiveStatus active={false} size="xl" />
        </Group>
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>xl</div>
      </div>
    </div>
  ),
};
