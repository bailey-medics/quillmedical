import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { QuestionResultsTable } from "./QuestionResultsTable";
import { questionLabel } from "./questionLabel";
import type { AssessmentQuestionResult } from "@/features/teaching/types";

function question(
  overrides: Partial<AssessmentQuestionResult>,
): AssessmentQuestionResult {
  return {
    question_number: 1,
    question_ref: "question_001",
    display_order: 1,
    answered: true,
    is_correct: true,
    answered_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

const questions: AssessmentQuestionResult[] = [
  question({
    question_number: 1,
    question_ref: "question_001",
    display_order: 3,
  }),
  question({
    question_number: 2,
    question_ref: "question_002",
    display_order: 1,
    is_correct: false,
  }),
  question({
    question_number: 3,
    question_ref: "question_003",
    display_order: 2,
    answered: false,
    is_correct: null,
    answered_at: null,
  }),
];

describe("QuestionResultsTable", () => {
  it("labels each row by its question number", () => {
    renderWithMantine(<QuestionResultsTable questions={questions} />);

    expect(screen.getAllByText("Question 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Question 2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Question 3").length).toBeGreaterThanOrEqual(1);
  });

  it("shows pass, fail and not answered", () => {
    renderWithMantine(<QuestionResultsTable questions={questions} />);

    expect(screen.getAllByText("Pass").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Fail").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not answered").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("keeps the order given, not the order shown in the exam", () => {
    renderWithMantine(<QuestionResultsTable questions={questions} />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((r) => within(r).getAllByRole("cell")[0].textContent),
    ).toEqual(["Question 1", "Question 2", "Question 3"]);
    expect(
      rows.map((r) => within(r).getAllByRole("cell")[2].textContent),
    ).toEqual(["3", "1", "2"]);
  });

  it("shows the empty message with no questions", () => {
    renderWithMantine(<QuestionResultsTable questions={[]} />);

    expect(
      screen.getAllByText("No questions in this assessment").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows an error in place of the rows", () => {
    renderWithMantine(
      <QuestionResultsTable questions={questions} error="Could not load" />,
    );

    expect(screen.getAllByText("Could not load").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByText("Question 1")).not.toBeInTheDocument();
  });

  it("shows no rows while loading", () => {
    renderWithMantine(<QuestionResultsTable questions={questions} loading />);

    expect(screen.queryByText("Question 1")).not.toBeInTheDocument();
  });
});

describe("questionLabel", () => {
  it("uses the number when there is one", () => {
    expect(questionLabel(question({ question_number: 12 }))).toBe(
      "Question 12",
    );
  });

  it("falls back to the directory name", () => {
    expect(
      questionLabel(
        question({ question_number: null, question_ref: "intro_case" }),
      ),
    ).toBe("intro_case");
  });

  it("never shows undefined for a missing number", () => {
    expect(
      questionLabel(question({ question_number: null, question_ref: "x" })),
    ).not.toContain("undefined");
  });
});
