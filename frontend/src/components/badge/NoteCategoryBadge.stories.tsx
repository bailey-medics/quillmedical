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

const meta: Meta<typeof NoteCategoryBadge> = {
  title: "Badge/Note category badge",
  component: NoteCategoryBadge,
  parameters: { layout: "padded" },
  argTypes: {
    category: {
      control: "select",
      options: ["consultation", "telephone", "observation", "procedure"],
      description: "Note category",
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

/** Shows all categories. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {allCategories.map((category) => (
        <NoteCategoryBadge key={category} category={category} />
      ))}
    </Group>
  ),
};
