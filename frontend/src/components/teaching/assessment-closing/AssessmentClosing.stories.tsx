import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentClosing } from "./AssessmentClosing";

const meta: Meta<typeof AssessmentClosing> = {
  title: "Teaching/AssessmentClosing",
  component: AssessmentClosing,
};

export default meta;
type Story = StoryObj<typeof AssessmentClosing>;

export const Default: Story = {
  args: {
    title: "Assessment complete",
    body: "Thank you for completing the assessment. Click below to view your results.",
    onViewResults: () => {},
  },
};

export const Disabled: Story = {
  args: {
    title: "Assessment complete",
    body: "Calculating your results...",
    onViewResults: () => {},
    disabled: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
