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

  it("displays percentage values", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("78.0%")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
  });

  it("displays threshold values", () => {
    renderWithMantine(<ScoreBreakdown criteria={criteria} />);
    expect(screen.getByText("/ 70%")).toBeInTheDocument();
    expect(screen.getByText("/ 85%")).toBeInTheDocument();
  });
});
