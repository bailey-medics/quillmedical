/**
 * CompetencySummary Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import CompetencySummary from "./CompetencySummary";
import { competencies } from "./fixtures";

const meta: Meta<typeof CompetencySummary> = {
  title: "Passport/Competency summary",
  component: CompetencySummary,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencySummary>;

export const Default: Story = {
  args: { competencies },
};

export const Selectable: Story = {
  args: {
    competencies,
    onSelect: (id: string) => console.log("selected", id),
  },
};

export const Empty: Story = {
  args: { competencies: [] },
};

export const Loading: Story = {
  args: { competencies: [], isLoading: true },
};
