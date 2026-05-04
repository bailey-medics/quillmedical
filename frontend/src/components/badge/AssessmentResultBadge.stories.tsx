/**
 * AssessmentResultBadge Storybook Stories
 *
 * Demonstrates the AssessmentResultBadge component in all result states
 * and size variants.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import AssessmentResultBadge from "./AssessmentResultBadge";

const meta: Meta<typeof AssessmentResultBadge> = {
  title: "Badge/AssessmentResultBadge",
  component: AssessmentResultBadge,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    result: {
      control: "select",
      options: ["pass", "fail", "incomplete"],
      description: "Assessment result",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentResultBadge>;

/**
 * Shows all three result states with default size.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <AssessmentResultBadge result="pass" />
      <AssessmentResultBadge result="fail" />
      <AssessmentResultBadge result="incomplete" />
    </Group>
  ),
};

/**
 * All sizes comparison
 *
 * Shows all size variants side by side for comparison.
 */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <AssessmentResultBadge result="pass" size={size} />
          <AssessmentResultBadge result="fail" size={size} />
          <AssessmentResultBadge result="incomplete" size={size} />
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
          <AssessmentResultBadge result="pass" size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
