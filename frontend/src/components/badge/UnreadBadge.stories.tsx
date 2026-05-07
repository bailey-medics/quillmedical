/**
 * UnreadBadge Storybook Stories
 *
 * Demonstrates the UnreadBadge component with various counts and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import UnreadBadge from "./UnreadBadge";

const meta: Meta<typeof UnreadBadge> = {
  title: "Badge/UnreadBadge",
  component: UnreadBadge,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof UnreadBadge>;

const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const Default: Story = {
  render: () => (
    <Group gap="md">
      {counts.map((count) => (
        <UnreadBadge key={count} count={count} />
      ))}
    </Group>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          {counts.map((count) => (
            <UnreadBadge key={count} count={count} size={size} />
          ))}
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
          <UnreadBadge count={1} size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
