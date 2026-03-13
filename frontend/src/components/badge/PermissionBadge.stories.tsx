/**
 * PermissionBadge Storybook Stories
 *
 * Demonstrates the PermissionBadge component with different permission levels,
 * sizes, and variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
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
    <Group gap="md">
      <PermissionBadge permission="superadmin" size="xl" />
      <PermissionBadge permission="admin" size="xl" />
      <PermissionBadge permission="staff" size="xl" />
    </Group>
  ),
};

/**
 * Size Variants
 *
 * Shows permission badges in different sizes: xs, sm, md, lg, xl.
 */
export const SizeVariants: Story = {
  render: () => (
    <VariantStack>
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "xl" ? "xl (default)" : size}>
          <PermissionBadge permission="superadmin" size={size} />
          <PermissionBadge permission="admin" size={size} />
          <PermissionBadge permission="staff" size={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/**
 * Loading state with skeleton placeholders at each size.
 */
export const Loading: Story = {
  render: () => (
    <VariantStack>
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow
          key={size}
          label={size === "xl" ? "xl (default)" : size}
          horizontal={false}
        >
          <PermissionBadge permission="superadmin" size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
