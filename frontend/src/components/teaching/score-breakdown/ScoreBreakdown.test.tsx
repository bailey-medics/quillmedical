import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { ScoreBreakdown } from "./ScoreBreakdown";

describe("ScoreBreakdown", () => {
  const criteria = [
    { name: "High confidence rate", value: 0.78, threshold: 0.7, passed: true },
    { name: "Accuracy", value: 0.6, threshold: 0.85, passed: false },
  ];

  it("renders the Score breakdown heading", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("Score breakdown")).toBeInTheDocument();
  });

  it("renders all criterion names", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("High confidence rate")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
  });

  it("shows pass and fail badges", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("displays percentage values to two decimal places", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("78.00%")).toBeInTheDocument();
    expect(screen.getByText("60.00%")).toBeInTheDocument();
  });

  it("never shows a near miss as the pass mark", () => {
    // 96 right out of 113 is 84.96%, which one decimal place showed as
    // 85.0% beside a fail.
    renderWithMantine(
      <ScoreBreakdown
        criteria={[
          {
            name: "High confidence accuracy",
            value: 0.8496,
            threshold: 0.85,
            passed: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("84.96%")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("displays threshold values", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("/ 70%")).toBeInTheDocument();
    expect(screen.getByText("/ 85%")).toBeInTheDocument();
  });
});
