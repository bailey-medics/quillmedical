import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuestionResultsTable } from "./QuestionResultsTable";
import type { AssessmentQuestionResult } from "@/features/teaching/types";

function question(
  n: number,
  shownAt: number,
  outcome: "pass" | "fail" | "unanswered",
): AssessmentQuestionResult {
  return {
    question_number: n,
    question_ref: `question_${String(n).padStart(3, "0")}`,
    display_order: shownAt,
    answered: outcome !== "unanswered",
    is_correct: outcome === "unanswered" ? null : outcome === "pass",
    answered_at: outcome === "unanswered" ? null : "2026-09-27T10:00:00Z",
  };
}

const meta: Meta<typeof QuestionResultsTable> = {
  title: "Teaching/Question results table",
  component: QuestionResultsTable,
};

export default meta;
type Story = StoryObj<typeof QuestionResultsTable>;

export const Mixed: Story = {
  args: {
    questions: [
      question(1, 4, "pass"),
      question(2, 1, "fail"),
      question(3, 5, "pass"),
      question(4, 2, "pass"),
      question(5, 3, "fail"),
    ],
  },
};

export const AllPassed: Story = {
  args: {
    questions: [
      question(1, 2, "pass"),
      question(2, 3, "pass"),
      question(3, 1, "pass"),
    ],
  },
};

export const SomeNotAnswered: Story = {
  args: {
    questions: [
      question(1, 3, "pass"),
      question(2, 1, "unanswered"),
      question(3, 2, "unanswered"),
    ],
  },
};

export const WithoutQuestionNumbers: Story = {
  args: {
    questions: [
      {
        ...question(1, 2, "pass"),
        question_number: null,
        question_ref: "intro_case",
      },
      {
        ...question(2, 1, "fail"),
        question_number: null,
        question_ref: "follow_up",
      },
    ],
  },
};

export const Loading: Story = {
  args: { questions: [], loading: true },
};

export const Empty: Story = {
  args: { questions: [] },
};

export const DarkMode: Story = {
  ...Mixed,
  globals: { colorScheme: "dark" },
};
