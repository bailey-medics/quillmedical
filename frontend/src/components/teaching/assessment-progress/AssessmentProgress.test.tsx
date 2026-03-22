import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentProgress } from "./AssessmentProgress";

describe("AssessmentProgress", () => {
  it("renders current and total", () => {
    renderWithMantine(<AssessmentProgress current={5} total={120} />);
    expect(screen.getByText("5 of 120")).toBeInTheDocument();
  });

  it("shows progress bar", () => {
    renderWithMantine(<AssessmentProgress current={60} total={120} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
