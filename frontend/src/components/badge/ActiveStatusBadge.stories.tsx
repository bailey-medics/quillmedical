/**
 * ActiveStatus Badge Storybook Stories
 *
 * Demonstrates the ActiveStatus component in various states and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import ActiveStatusBadge from "./ActiveStatusBadge";

const meta: Meta<typeof ActiveStatusBadge> = {
  title: "Badge/ActiveStatusBadge",
  component: ActiveStatusBadge,
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

/**
 * All Sizes Comparison
 *
 * Shows all size variants side by side for comparison.
 */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <ActiveStatusBadge active={true} size={size} />
          <ActiveStatusBadge active={false} size={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/** Loading skeleton at each size. */
export const Loading: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow
          key={size}
          label={size === "lg" ? "lg (default)" : size}
          horizontal={false}
        >
          <ActiveStatusBadge active={true} size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
