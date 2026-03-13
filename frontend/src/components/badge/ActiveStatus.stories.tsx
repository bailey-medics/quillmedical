/**
 * ActiveStatus Badge Storybook Stories
 *
 * Demonstrates the ActiveStatus component in various states and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
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
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "md" ? "md (default)" : size}>
          <ActiveStatus active={true} size={size} />
          <ActiveStatus active={false} size={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
