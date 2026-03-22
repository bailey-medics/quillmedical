import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentResult } from "./AssessmentResult";

const meta: Meta<typeof AssessmentResult> = {
  title: "Teaching/AssessmentResult",
  component: AssessmentResult,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AssessmentResult>;

export const Passed: Story = {
  args: {
    isPassed: true,
    bankTitle: "Optical diagnosis of diminutive colorectal polyps",
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

export const Failed: Story = {
  args: {
    isPassed: false,
    bankTitle: "Optical diagnosis of diminutive colorectal polyps",
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

export const NoTitle: Story = {
  args: {
    isPassed: true,
    criteria: [
      { name: "Overall accuracy", value: 0.85, threshold: 0.8, passed: true },
    ],
  },
};
