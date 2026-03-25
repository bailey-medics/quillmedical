import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuestionBankCard } from "./QuestionBankCard";

const meta: Meta<typeof QuestionBankCard> = {
  title: "Teaching/QuestionBankCard",
  component: QuestionBankCard,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof QuestionBankCard>;

export const Default: Story = {
  args: {
    title: "Optical diagnosis of diminutive colorectal polyps",
    description:
      "Assess colonoscopists' ability to optically diagnose diminutive (≤5mm) colorectal polyps using white light and narrow band imaging.",
    onStart: () => {},
  },
};

export const FewItems: Story = {
  args: {
    title: "Medication safety MCQs",
    description: "Test your knowledge of common drug interactions and dosing.",
    onStart: () => {},
  },
};

export const Disabled: Story = {
  args: {
    title: "Dermatology lesion assessment",
    description: "Classify skin lesions from clinical photographs.",
    onStart: () => {},
    disabled: true,
  },
};
