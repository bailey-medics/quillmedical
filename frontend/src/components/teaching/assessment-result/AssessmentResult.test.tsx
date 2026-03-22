import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentResult } from "./AssessmentResult";

describe("AssessmentResult", () => {
  const passCriteria = [
    { name: "High confidence rate", value: 0.78, threshold: 0.7, passed: true },
    { name: "Accuracy", value: 0.91, threshold: 0.85, passed: true },
  ];

  const failCriteria = [
    {
      name: "High confidence rate",
      value: 0.55,
      threshold: 0.7,
      passed: false,
    },
    { name: "Accuracy", value: 0.91, threshold: 0.85, passed: true },
  ];

  it("shows 'Passed' when isPassed is true", () => {
    renderWithMantine(
      <AssessmentResult isPassed={true} criteria={passCriteria} />,
    );
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("shows 'Not passed' when isPassed is false", () => {
    renderWithMantine(
      <AssessmentResult isPassed={false} criteria={failCriteria} />,
    );
    expect(screen.getByText("Not passed")).toBeInTheDocument();
  });

  it("renders bank title when provided", () => {
    renderWithMantine(
      <AssessmentResult
        isPassed={true}
        criteria={passCriteria}
        bankTitle="Polyp diagnosis"
      />,
    );
    expect(screen.getByText("Polyp diagnosis")).toBeInTheDocument();
  });

  it("renders score breakdown", () => {
    renderWithMantine(
      <AssessmentResult isPassed={true} criteria={passCriteria} />,
    );
    expect(screen.getByText("Score breakdown")).toBeInTheDocument();
    expect(screen.getByText("High confidence rate")).toBeInTheDocument();
  });
});
