/**
 * PlatformRoleBadge Storybook Stories
 *
 * Shows the operator pill and the silence that is the ordinary case.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import PlatformRoleBadge from "./PlatformRoleBadge";
import { StoryNote } from "@/stories/variants";

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
