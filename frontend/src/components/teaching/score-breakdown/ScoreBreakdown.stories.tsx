import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScoreBreakdown } from "./ScoreBreakdown";

const meta: Meta<typeof ScoreBreakdown> = {
  title: "Teaching/ScoreBreakdown",
  component: ScoreBreakdown,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof ScoreBreakdown>;

export const AllPassed: Story = {
  args: {
    criteria: [
      {
        name: "High confidence rate",
        value: 0.78,
        threshold: 0.7,
        passed: true,
      },
      {
        name: "Accuracy of high-confidence answers",
        value: 0.91,
        threshold: 0.85,
        passed: true,
      },
    ],
  },
};

export const OneFailed: Story = {
  args: {
    criteria: [
      {
        name: "High confidence rate",
        value: 0.65,
        threshold: 0.7,
        passed: false,
      },
      {
        name: "Accuracy of high-confidence answers",
        value: 0.91,
        threshold: 0.85,
        passed: true,
      },
    ],
  },
};

export const AllFailed: Story = {
  args: {
    criteria: [
      {
        name: "High confidence rate",
        value: 0.55,
        threshold: 0.7,
        passed: false,
      },
      {
        name: "Accuracy of high-confidence answers",
        value: 0.72,
        threshold: 0.85,
        passed: false,
      },
    ],
  },
};

export const DarkMode: Story = {
  ...AllPassed,
  globals: { colorScheme: "dark" },
};
