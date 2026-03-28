import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container } from "@mantine/core";
import { QuestionView } from "./QuestionView";
import type { CandidateItem } from "@/features/teaching/types";

const uniformItem: CandidateItem = {
  answer_id: 1,
  display_order: 1,
  question_type: "single",
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
  question_type: "single",
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
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <>
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            minHeight: 60,
            background: "#e6f7ff",
            display: "flex",
            alignItems: "center",
            padding: "var(--mantine-spacing-sm)",
            fontWeight: 600,
          }}
        >
          Quill Medical — ribbon placeholder
        </div>
        <Container size="lg" py="xl">
          <Story />
        </Container>
      </>
    ),
  ],
  args: {
    timeLimitMinutes: 75,
    startedAt: new Date().toISOString(),
    onExpire: () => {},
  },
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
    onNext: () => {},
    isLastQuestion: false,
  },
};

export const UniformWithSelection: Story = {
  args: {
    item: { ...uniformItem, display_order: 3 },
    selectedOption: "high_confidence_adenoma",
    onSelectOption: () => {},
    currentQuestion: 3,
    totalQuestions: 20,
    onPrevious: () => {},
    onNext: () => {},
    isLastQuestion: false,
  },
};

export const VariableType: Story = {
  args: {
    item: { ...variableItem, display_order: 5 },
    selectedOption: null,
    onSelectOption: () => {},
    currentQuestion: 5,
    totalQuestions: 20,
    onPrevious: () => {},
    onNext: () => {},
    isLastQuestion: false,
  },
};

export const LastQuestion: Story = {
  args: {
    item: { ...uniformItem, display_order: 20 },
    selectedOption: "low_confidence_adenoma",
    onSelectOption: () => {},
    currentQuestion: 20,
    totalQuestions: 20,
    onPrevious: () => {},
    onSubmit: () => {},
    isLastQuestion: true,
  },
};

export const Disabled: Story = {
  args: {
    item: { ...uniformItem, display_order: 20 },
    selectedOption: "low_confidence_adenoma",
    onSelectOption: () => {},
    disabled: true,
    currentQuestion: 20,
    totalQuestions: 20,
    onPrevious: () => {},
    onSubmit: () => {},
    isLastQuestion: true,
  },
};
