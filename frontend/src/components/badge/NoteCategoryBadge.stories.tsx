/**
 * NoteCategoryBadge Stories
 *
 * Demonstrates all clinical note category badges with their
 * semantic colours from the design system.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import NoteCategoryBadge from "./NoteCategoryBadge";
import type { NoteCategoryType } from "./NoteCategoryBadge";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof NoteCategoryBadge> = {
  title: "Badge/NoteCategoryBadge",
  component: NoteCategoryBadge,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    category: {
      control: "select",
      options: ["consultation", "telephone", "observation", "procedure"],
      description: "Note category",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;

type Story = StoryObj<typeof NoteCategoryBadge>;

const allCategories: NoteCategoryType[] = [
  "consultation",
  "telephone",
  "observation",
  "procedure",
];

/** Shows all categories with default large size. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {allCategories.map((category) => (
        <NoteCategoryBadge key={category} category={category} />
      ))}
    </Group>
  ),
};

/** All sizes comparison across all categories. */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          {allCategories.map((category) => (
            <NoteCategoryBadge key={category} category={category} size={size} />
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
          <NoteCategoryBadge category="consultation" size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
