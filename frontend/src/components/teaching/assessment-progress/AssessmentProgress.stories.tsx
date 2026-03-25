import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentProgress } from "./AssessmentProgress";

const meta: Meta<typeof AssessmentProgress> = {
  title: "Teaching/AssessmentProgress",
  component: AssessmentProgress,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AssessmentProgress>;

export const Start: Story = {
  args: { current: 1, total: 120 },
};

export const Midway: Story = {
  args: { current: 60, total: 120 },
};

export const NearEnd: Story = {
  args: { current: 118, total: 120 },
};

export const Complete: Story = {
  args: { current: 120, total: 120 },
};
