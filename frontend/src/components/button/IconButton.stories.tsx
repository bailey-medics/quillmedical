/**
 * IconButton Component Stories
 *
 * Storybook stories for the IconButton component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import IconButton from "./IconButton";
import { IconPencil } from "@tabler/icons-react";
import { VariantRow, VariantStack, ButtonStateGrid } from "@/stories/variants";

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

const variants = [
  "subtle",
  "light",
  "filled",
  "outline",
  "default",
  "transparent",
  "white",
] as const;

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

/**
 * Each variant as a row, showing all interaction states.
 */
export const VariantsAndStates: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Example",
  },
  render: () => (
    <ButtonStateGrid
      variants={variants}
      renderButton={(variant, stateProps) => (
        <IconButton
          icon={<IconPencil />}
          variant={
            variant as
              | "subtle"
              | "light"
              | "filled"
              | "outline"
              | "default"
              | "transparent"
              | "white"
          }
          aria-label={variant}
          {...stateProps}
        />
      )}
    />
  ),
};
