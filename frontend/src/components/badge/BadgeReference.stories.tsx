/**
 * Badge Reference Storybook Stories
 *
 * Displays all available badge colours and loading states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Stack } from "@mantine/core";
import { badgeColours, BADGE_VARIANT, type BadgeColour } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";
import ActiveStatusBadge from "./ActiveStatusBadge";

const meta: Meta = {
  title: "Badge/Reference",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

const allColours = Object.entries(badgeColours) as [
  BadgeColour,
  { bg: string; text: string },
][];

/** All available badge colours displayed in a column. */
export const AllColours: Story = {
  render: () => (
    <Stack gap="md" align="flex-start">
      {allColours.map(([name, { bg, text }]) => (
        <Badge key={name} color={bg} c={text} variant={BADGE_VARIANT}>
          {name}
        </Badge>
      ))}
      <BadgeSkeleton />
    </Stack>
  ),
};

/** Loading skeleton. */
export const Loading: Story = {
  render: () => <ActiveStatusBadge active={true} isLoading />,
};

export const DarkMode: Story = {
  ...AllColours,
  globals: { colorScheme: "dark" },
};
