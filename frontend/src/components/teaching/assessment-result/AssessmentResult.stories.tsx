import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AssessmentResult } from "./AssessmentResult";

const passCriteria = [
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
];

const failCriteria = [
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
];

const meta: Meta<typeof AssessmentResult> = {
  title: "Teaching/AssessmentResult",
  component: AssessmentResult,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentResult>;

/** Passed result with certificate download and back-to-dashboard button. */
export const Passed: Story = {
  args: {
    isPassed: true,
    bankTitle: "Optical diagnosis of diminutive colorectal polyps",
    criteria: passCriteria,
    assessmentId: 42,
    showCertificate: true,
    showBackToDashboard: true,
    onBackToDashboard: fn(),
  },
};

/** Failed result with try-again and back-to-dashboard buttons. */
export const Failed: Story = {
  args: {
    isPassed: false,
    bankTitle: "Optical diagnosis of diminutive colorectal polyps",
    criteria: failCriteria,
    showTryAgain: true,
    showBackToDashboard: true,
    onTryAgain: fn(),
    onBackToDashboard: fn(),
  },
};

/** Passed result without certificate (viewed from dashboard history). */
export const PassedFromDashboard: Story = {
  args: {
    isPassed: true,
    bankTitle: "Optical diagnosis of diminutive colorectal polyps",
    criteria: passCriteria,
  },
};

export const DarkMode: Story = {
  ...Passed,
  globals: { colorScheme: "dark" },
};
