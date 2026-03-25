import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AssessmentHistoryTable } from "./AssessmentHistoryTable";

const meta: Meta<typeof AssessmentHistoryTable> = {
  title: "Teaching/AssessmentHistoryTable",
  component: AssessmentHistoryTable,
  tags: ["autodocs"],
  args: {
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentHistoryTable>;

export const WithAttempts: Story = {
  args: {
    assessments: [
      {
        id: 1,
        question_bank_id: "colonoscopy-optical-diagnosis",
        bank_version: 1,
        started_at: "2024-12-01T10:00:00Z",
        completed_at: "2024-12-01T11:10:00Z",
        is_passed: true,
        score_breakdown: null,
        total_items: 120,
      },
      {
        id: 2,
        question_bank_id: "colonoscopy-optical-diagnosis",
        bank_version: 1,
        started_at: "2024-11-15T14:00:00Z",
        completed_at: "2024-11-15T15:05:00Z",
        is_passed: false,
        score_breakdown: null,
        total_items: 120,
      },
      {
        id: 3,
        question_bank_id: "medication-safety",
        bank_version: 2,
        started_at: "2024-12-05T09:00:00Z",
        completed_at: null,
        is_passed: null,
        score_breakdown: null,
        total_items: 50,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    assessments: [],
  },
};
