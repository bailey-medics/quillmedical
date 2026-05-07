/**
 * CompetencyBadge Storybook Stories
 *
 * Demonstrates the CompetencyBadge component with different labels,
 * sizes, and the removed state.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import CompetencyBadge from "./CompetencyBadge";

const meta: Meta<typeof CompetencyBadge> = {
  title: "Badge/CompetencyBadge",
  component: CompetencyBadge,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CompetencyBadge>;

/**
 * Default competency badges showing typical competency names
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <CompetencyBadge label="Take Teaching Assessments" />
      <CompetencyBadge label="Manage Teaching Content" />
      <CompetencyBadge label="View Teaching Analytics" />
    </Group>
  ),
};

/**
 * Removed competencies displayed in alert colour
 */
export const Removed: Story = {
  render: () => (
    <Group gap="md">
      <CompetencyBadge label="Take Teaching Assessments" removed />
      <CompetencyBadge label="Manage Teaching Content" removed />
    </Group>
  ),
};

/**
 * Size variants for competency badges
 */
export const SizeVariants: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <CompetencyBadge label="Take Teaching Assessments" size={size} />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/**
 * Dark mode rendering
 */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};

/**
 * Loading skeleton state
 */
export const Loading: Story = {
  render: () => (
    <Group gap="md">
      <CompetencyBadge label="" isLoading />
      <CompetencyBadge label="" isLoading size="sm" />
    </Group>
  ),
};
