/**
 * NoteCategoryBadge Stories
 *
 * Demonstrates all clinical note category badges with their
 * semantic colours from the design system.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import NoteCategoryBadge from "./NoteCategoryBadge";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof NoteCategoryBadge> = {
  title: "Badge/NoteCategoryBadge",
  component: NoteCategoryBadge,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof NoteCategoryBadge>;

export const Default: Story = {
  args: {
    category: "consultation",
  },
};

export const AllCategories: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Consultation">
        <NoteCategoryBadge category="consultation" />
      </VariantRow>
      <VariantRow label="Telephone">
        <NoteCategoryBadge category="telephone" />
      </VariantRow>
      <VariantRow label="Observation">
        <NoteCategoryBadge category="observation" />
      </VariantRow>
      <VariantRow label="Procedure">
        <NoteCategoryBadge category="procedure" />
      </VariantRow>
    </VariantStack>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="sm">
        <NoteCategoryBadge category="consultation" size="sm" />
      </VariantRow>
      <VariantRow label="md">
        <NoteCategoryBadge category="consultation" size="md" />
      </VariantRow>
      <VariantRow label="lg (default)">
        <NoteCategoryBadge category="consultation" size="lg" />
      </VariantRow>
      <VariantRow label="xl">
        <NoteCategoryBadge category="consultation" size="xl" />
      </VariantRow>
    </VariantStack>
  ),
};

export const Loading: Story = {
  args: {
    category: "consultation",
    isLoading: true,
  },
};
