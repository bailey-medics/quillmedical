import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuestionView } from "./QuestionView";
import type { CandidateItem } from "@/features/teaching/types";

const uniformItem: CandidateItem = {
  answer_id: 1,
  display_order: 1,
  images: [
    {
      key: "image_1",
      label: "White light (WLI)",
      url: "https://placehold.co/400x300?text=WLI",
    },
    {
      key: "image_2",
      label: "Narrow band imaging (NBI)",
      url: "https://placehold.co/400x300?text=NBI",
    },
  ],
  options: [
    { id: "high_confidence_adenoma", label: "High confidence adenoma" },
    { id: "low_confidence_adenoma", label: "Low confidence adenoma" },
    {
      id: "high_confidence_serrated",
      label: "High confidence serrated polyp",
    },
    {
      id: "low_confidence_serrated",
      label: "Low confidence serrated polyp",
    },
  ],
};

const variableItem: CandidateItem = {
  answer_id: 2,
  display_order: 5,
  images: [
    {
      key: "lesion",
      url: "https://placehold.co/400x300?text=Lesion",
    },
  ],
  text: "A 65-year-old patient presents with a 3mm sessile polyp in the sigmoid colon.",
  options: [
    { id: "a", label: "Hyperplastic polyp" },
    { id: "b", label: "Tubular adenoma" },
    { id: "c", label: "Sessile serrated lesion" },
    { id: "d", label: "Inflammatory polyp" },
  ],
};

const meta: Meta<typeof QuestionView> = {
  title: "Teaching/QuestionView",
  component: QuestionView,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof QuestionView>;

export const UniformType: Story = {
  args: {
    item: uniformItem,
    selectedOption: null,
    onSelectOption: () => {},
    currentQuestion: 1,
    totalQuestions: 20,
  },
};

export const UniformWithSelection: Story = {
  args: {
    item: uniformItem,
    selectedOption: "high_confidence_adenoma",
    onSelectOption: () => {},
    currentQuestion: 3,
    totalQuestions: 20,
  },
};

export const VariableType: Story = {
  args: {
    item: variableItem,
    selectedOption: null,
    onSelectOption: () => {},
    currentQuestion: 5,
    totalQuestions: 20,
  },
};

export const Disabled: Story = {
  args: {
    item: uniformItem,
    selectedOption: "low_confidence_adenoma",
    onSelectOption: () => {},
    disabled: true,
    currentQuestion: 20,
    totalQuestions: 20,
  },
};
