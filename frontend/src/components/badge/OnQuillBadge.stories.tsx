/**
 * OnQuillBadge Storybook Stories
 *
 * Demonstrates the OnQuillBadge component in various sizes and states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import OnQuillBadge from "./OnQuillBadge";

const meta: Meta<typeof OnQuillBadge> = {
  title: "Badge/OnQuillBadge",
  component: OnQuillBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof OnQuillBadge>;

/** Default large size. */
export const Default: Story = {};

/** All size variants. */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <OnQuillBadge size={size} />
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
          <OnQuillBadge size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
