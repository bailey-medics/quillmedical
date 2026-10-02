/**
 * RiskScoreBadge Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import RiskScoreBadge from "./RiskScoreBadge";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof RiskScoreBadge> = {
  title: "Safety/Risk score badge",
  component: RiskScoreBadge,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof RiskScoreBadge>;

export const Default: Story = {
  args: { likelihood: 3, severity: 4 },
};

export const AllBands: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Acceptable (1 to 2)">
        <RiskScoreBadge likelihood={1} severity={1} />
        <RiskScoreBadge likelihood={1} severity={2} />
      </VariantRow>
      <VariantRow label="Tolerable (3 to 4)">
        <RiskScoreBadge likelihood={1} severity={3} />
        <RiskScoreBadge likelihood={2} severity={2} />
      </VariantRow>
      <VariantRow label="Undesirable (6 to 9)">
        <RiskScoreBadge likelihood={2} severity={3} />
        <RiskScoreBadge likelihood={3} severity={3} />
      </VariantRow>
      <VariantRow label="Unacceptable (10 to 25)">
        <RiskScoreBadge likelihood={2} severity={5} />
        <RiskScoreBadge likelihood={5} severity={5} />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...AllBands,
  globals: { colorScheme: "dark" },
};
