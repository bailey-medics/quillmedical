/**
 * Badge Reference Storybook Stories
 *
 * Displays all available badge colours, sizes, and loading states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Stack } from "@mantine/core";
import { badgeColours, BADGE_VARIANT, type BadgeColour } from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";
import ActiveStatusBadge from "./ActiveStatusBadge";
import { VariantRow, VariantStack } from "@/stories/variants";

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
        <Badge key={name} color={bg} c={text} variant={BADGE_VARIANT} size="lg">
          {name}
        </Badge>
      ))}
      <BadgeSkeleton size="lg" />
    </Stack>
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
          <Badge
            color={badgeColours.success.bg}
            c={badgeColours.success.text}
            variant={BADGE_VARIANT}
            size={size}
          >
            SUCCESS
          </Badge>
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
  ...AllColours,
  globals: { colorScheme: "dark" },
};
