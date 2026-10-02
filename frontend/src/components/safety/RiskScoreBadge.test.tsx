/**
 * RiskScoreBadge Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import RiskScoreBadge from "./RiskScoreBadge";

describe("RiskScoreBadge", () => {
  it("shows the product of likelihood and severity", () => {
    renderWithMantine(<RiskScoreBadge likelihood={3} severity={5} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("names both parts for a screen reader", () => {
    renderWithMantine(<RiskScoreBadge likelihood={2} severity={4} />);
    expect(
      screen.getByLabelText("Risk rating 8: likelihood 2, severity 4"),
    ).toBeInTheDocument();
  });

  it("shows the lowest and highest ratings", () => {
    const { rerender } = renderWithMantine(
      <RiskScoreBadge likelihood={1} severity={1} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    rerender(<RiskScoreBadge likelihood={5} severity={5} />);
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});
