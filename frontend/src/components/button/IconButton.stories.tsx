/**
 * IconButton Component Stories
 *
 * Storybook stories for the IconButton component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import IconButton from "./IconButton";
import { IconPencil } from "@/components/icons/appIcons";
import type { IconSize } from "@/components/icons";
import { StateRow, VariantRow, VariantStack } from "@/stories/variants";

const SIZES: IconSize[] = ["sm", "md", "lg"];

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
 * All three sizes side-by-side.
 */
export const Sizes: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
  render: () => (
    <VariantStack>
      {SIZES.map((size) => (
        <StateRow
          key={size}
          label={size === "md" ? "md (default)" : size}
          align="start"
        >
          <IconButton icon={<IconPencil />} size={size} aria-label={size} />
        </StateRow>
      ))}
    </VariantStack>
  ),
};

const VARIANTS: Array<
  | "filled"
  | "light"
  | "outline"
  | "subtle"
  | "transparent"
  | "default"
  | "white"
> = ["filled", "light", "outline", "subtle", "transparent", "default", "white"];

/**
 * All Mantine variants with interaction states.
 * Each row is a variant, columns show default → hover → active → focus → disabled.
 */
export const Variants: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
  render: () => (
    <VariantStack>
      {VARIANTS.map((variant) => (
        <VariantRow
          key={variant}
          label={variant === "filled" ? "filled (actual default)" : variant}
        >
          <StateRow label="default">
            <IconButton
              icon={<IconPencil />}
              variant={variant}
              aria-label="default"
            />
          </StateRow>
          <StateRow label="hover" state="hover">
            <IconButton
              icon={<IconPencil />}
              variant={variant}
              aria-label="hover"
            />
          </StateRow>
          <StateRow label="active" state={["hover", "active"]}>
            <IconButton
              icon={<IconPencil />}
              variant={variant}
              aria-label="active"
            />
          </StateRow>
          <StateRow label="focus-visible" state="focus-visible">
            <IconButton
              icon={<IconPencil />}
              variant={variant}
              aria-label="focus"
            />
          </StateRow>
          <StateRow label="disabled">
            <IconButton
              icon={<IconPencil />}
              variant={variant}
              aria-label="disabled"
              disabled
            />
          </StateRow>
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
