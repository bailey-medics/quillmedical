import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const matches = screen.getAllByText("Passed");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Not passed' when isPassed is false", () => {
    renderWithMantine(
      <AssessmentResult isPassed={false} criteria={failCriteria} />,
    );
    const matches = screen.getAllByText("Not passed");
    expect(matches.length).toBeGreaterThanOrEqual(1);
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

  it("shows certificate download when showCertificate is true", () => {
    renderWithMantine(
      <AssessmentResult
        isPassed={true}
        criteria={passCriteria}
        assessmentId={42}
        showCertificate
      />,
    );
    expect(
      screen.getByRole("button", { name: /download certificate/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/download your certificate below/i),
    ).toBeInTheDocument();
  });

  it("hides certificate when showCertificate is false", () => {
    renderWithMantine(
      <AssessmentResult isPassed={true} criteria={passCriteria} />,
    );
    expect(
      screen.queryByRole("button", { name: /download certificate/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Try again button when showTryAgain is true", () => {
    const handleTryAgain = vi.fn();
    renderWithMantine(
      <AssessmentResult
        isPassed={false}
        criteria={failCriteria}
        showTryAgain
        onTryAgain={handleTryAgain}
      />,
    );
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("calls onTryAgain when Try again is clicked", async () => {
    const user = userEvent.setup();
    const handleTryAgain = vi.fn();
    renderWithMantine(
      <AssessmentResult
        isPassed={false}
        criteria={failCriteria}
        showTryAgain
        onTryAgain={handleTryAgain}
      />,
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(handleTryAgain).toHaveBeenCalledTimes(1);
  });

  it("shows Back to dashboard button when showBackToDashboard is true", () => {
    const handleBack = vi.fn();
    renderWithMantine(
      <AssessmentResult
        isPassed={true}
        criteria={passCriteria}
        showBackToDashboard
        onBackToDashboard={handleBack}
      />,
    );
    expect(
      screen.getByRole("button", { name: /back to dashboard/i }),
    ).toBeInTheDocument();
  });

  it("calls onBackToDashboard when Back to dashboard is clicked", async () => {
    const user = userEvent.setup();
    const handleBack = vi.fn();
    renderWithMantine(
      <AssessmentResult
        isPassed={true}
        criteria={passCriteria}
        showBackToDashboard
        onBackToDashboard={handleBack}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /back to dashboard/i }),
    );
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("hides buttons when not configured", () => {
    renderWithMantine(
      <AssessmentResult isPassed={true} criteria={passCriteria} />,
    );
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /back to dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
