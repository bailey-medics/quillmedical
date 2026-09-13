/**
 * PlatformRoleBadge Storybook Stories
 *
 * Shows the operator pill and the silence that is the ordinary case.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import PlatformRoleBadge from "./PlatformRoleBadge";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof PlatformRoleBadge> = {
  title: "Badge/Platform role badge",
  component: PlatformRoleBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof PlatformRoleBadge>;

/**
 * Default
 *
 * An operator, and everyone else.
 */
export const Default: Story = {
  render: () => (
    <Stack gap="md">
      <Group gap="md">
        <PlatformRoleBadge platformRole="superadmin" />
      </Group>
      <StoryNote>
        Only an operator is marked. A standard account renders nothing at all,
        so the badge stays rare enough to mean something.
      </StoryNote>
    </Stack>
  ),
};

/**
 * Both roles
 *
 * The empty row is the ordinary case, not a bug.
 */
export const BothRoles: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="superadmin">
        <PlatformRoleBadge platformRole="superadmin" />
      </VariantRow>
      <VariantRow label="standard (renders nothing)">
        <PlatformRoleBadge platformRole="standard" />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * Variants
 */
export const Variants: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="light (default)">
        <PlatformRoleBadge platformRole="superadmin" variant="light" />
      </VariantRow>
      <VariantRow label="filled">
        <PlatformRoleBadge platformRole="superadmin" variant="filled" />
      </VariantRow>
      <VariantRow label="outline">
        <PlatformRoleBadge platformRole="superadmin" variant="outline" />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * Loading
 */
export const Loading: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="loading" horizontal={false}>
        <PlatformRoleBadge platformRole="superadmin" isLoading />
      </VariantRow>
    </VariantStack>
  ),
};
