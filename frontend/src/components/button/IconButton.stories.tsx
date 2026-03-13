/**
 * IconButton Component Stories
 *
 * Storybook stories for the IconButton component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import IconButton from "./IconButton";
import { IconPencil } from "@tabler/icons-react";
import { StateRow, VariantRow, VariantStack } from "@/stories/variants";
import { Group } from "@mantine/core";

const meta = {
  title: "Button/IconButton",
  component: IconButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default IconButton with all Mantine style variants.
 */
export const Default: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
};

/**
 * All three sizes shown side-by-side for comparison.
 * Resize browser below 768px to see mobile sizes.
 */
export const AllSizes: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Example",
  },
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg"] as const).map((size) => (
        <VariantRow
          key={size}
          label={size === "md" ? "md (default)" : size}
          horizontal={false}
        >
          <IconButton icon={<IconPencil />} size={size} aria-label={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/** All interaction states side-by-side. */
export const States: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
  render: () => (
    <Group gap="xl">
      <StateRow label="default">
        <IconButton icon={<IconPencil />} aria-label="default" />
      </StateRow>
      <StateRow label="hover" state="hover">
        <IconButton icon={<IconPencil />} aria-label="hover" />
      </StateRow>
      <StateRow label="active" state="active">
        <IconButton icon={<IconPencil />} aria-label="active" />
      </StateRow>
      <StateRow label="focus-visible" state="focus-visible">
        <IconButton icon={<IconPencil />} aria-label="focus" />
      </StateRow>
      <StateRow label="disabled">
        <IconButton icon={<IconPencil />} aria-label="disabled" disabled />
      </StateRow>
    </Group>
  ),
};
