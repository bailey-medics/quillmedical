import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentHistoryTable } from "./AssessmentHistoryTable";
import type { AssessmentHistory } from "@/features/teaching/types";

const assessments: AssessmentHistory[] = [
  {
    id: 1,
    question_bank_id: "polyp-diagnosis",
    bank_title: "Polyp diagnosis",
    bank_version: 1,
    started_at: "2024-12-01T10:00:00Z",
    completed_at: "2024-12-01T11:00:00Z",
    is_passed: true,
    score_breakdown: null,
    total_items: 120,
  },
  {
    id: 2,
    question_bank_id: "polyp-diagnosis",
    bank_title: "Polyp diagnosis",
    bank_version: 1,
    started_at: "2024-11-20T14:00:00Z",
    completed_at: "2024-11-20T15:00:00Z",
    is_passed: false,
    score_breakdown: null,
    total_items: 120,
  },
  {
    id: 3,
    question_bank_id: "meds-safety",
    bank_title: "Medication safety",
    bank_version: 2,
    started_at: "2024-12-05T09:00:00Z",
    completed_at: null,
    is_passed: null,
    score_breakdown: null,
    total_items: 50,
  },
];

describe("AssessmentHistoryTable", () => {
  it("shows empty message when no assessments", () => {
    renderWithMantine(<AssessmentHistoryTable assessments={[]} />);

    expect(screen.getByText("No assessments yet.")).toBeInTheDocument();
  });

  it("renders question bank titles", () => {
    renderWithMantine(<AssessmentHistoryTable assessments={assessments} />);

    expect(
      screen.getAllByText("Polyp diagnosis").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Medication safety")).toBeInTheDocument();
  });

  it("shows pass/fail/incomplete badges", () => {
    renderWithMantine(<AssessmentHistoryTable assessments={assessments} />);

    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });

  it("shows started_at date for uncompleted assessments", () => {
    renderWithMantine(<AssessmentHistoryTable assessments={assessments} />);

    // The third assessment has no completed_at but started 5 Dec 2024
    expect(screen.getByText("5 Dec 2024")).toBeInTheDocument();
  });

  it("calls onSelect when row clicked", async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <AssessmentHistoryTable
        assessments={assessments}
        onSelect={handleSelect}
      />,
    );

    // Click the first row data cell
    await user.click(screen.getAllByText("Polyp diagnosis")[0]);
    expect(handleSelect).toHaveBeenCalledWith(1);
  });
});
