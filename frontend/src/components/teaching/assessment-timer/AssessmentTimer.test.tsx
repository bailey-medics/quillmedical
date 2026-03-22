import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentTimer } from "./AssessmentTimer";

describe("AssessmentTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays the remaining time", () => {
    renderWithMantine(
      <AssessmentTimer
        timeLimitMinutes={75}
        startedAt={new Date().toISOString()}
        onExpire={() => {}}
      />,
    );

    expect(screen.getByText("75:00")).toBeInTheDocument();
  });

  it("accounts for already elapsed time", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    renderWithMantine(
      <AssessmentTimer
        timeLimitMinutes={75}
        startedAt={tenMinutesAgo}
        onExpire={() => {}}
      />,
    );

    expect(screen.getByText("65:00")).toBeInTheDocument();
  });

  it("shows 'Time up' when expired", () => {
    const pastStart = new Date(Date.now() - 80 * 60 * 1000).toISOString();

    renderWithMantine(
      <AssessmentTimer
        timeLimitMinutes={75}
        startedAt={pastStart}
        onExpire={() => {}}
      />,
    );

    expect(screen.getByText("Time up")).toBeInTheDocument();
  });

  it("calls onExpire when time runs out", () => {
    const handleExpire = vi.fn();
    const pastStart = new Date(Date.now() - 80 * 60 * 1000).toISOString();

    renderWithMantine(
      <AssessmentTimer
        timeLimitMinutes={75}
        startedAt={pastStart}
        onExpire={handleExpire}
      />,
    );

    expect(handleExpire).toHaveBeenCalled();
  });
});
