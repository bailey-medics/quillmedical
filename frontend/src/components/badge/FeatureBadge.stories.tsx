/**
 * FeatureBadge Storybook Stories
 *
 * Demonstrates the FeatureBadge component with different labels
 * and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import FeatureBadge from "./FeatureBadge";

const meta: Meta<typeof FeatureBadge> = {
  title: "Badge/FeatureBadge",
  component: FeatureBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof FeatureBadge>;

/**
 * Default feature badges showing typical feature names
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <FeatureBadge label="Teaching" />
      <FeatureBadge label="Messaging" />
      <FeatureBadge label="Letters" />
    </Group>
  ),
};

/**
 * Size variants for feature badges
 */
export const SizeVariants: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <FeatureBadge label="Teaching" size={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/**
 * Dark mode rendering
 */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};

/**
 * Loading skeleton state
 */
export const Loading: Story = {
  render: () => (
    <Group gap="md">
      <FeatureBadge label="" isLoading />
      <FeatureBadge label="" isLoading size="sm" />
    </Group>
  ),
};
