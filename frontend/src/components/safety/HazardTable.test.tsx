/**
 * HazardTable Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import HazardTable from "./HazardTable";
import { SAFETY_CASES } from "@lib/safety";

describe("HazardTable", () => {
  it("lists every hazard with its reference and description", () => {
    renderWithMantine(<HazardTable hazards={SAFETY_CASES[0].hazards} />);
    expect(screen.getByText("H-01")).toBeInTheDocument();
    expect(
      screen.getByText("Wrong dose unit shown on the prescribing screen"),
    ).toBeInTheDocument();
  });

  it("shows the initial and residual risk ratings", () => {
    renderWithMantine(<HazardTable hazards={[SAFETY_CASES[0].hazards[0]]} />);
    // 3 x 5 before mitigation, 1 x 5 after
    expect(
      screen.getByLabelText("Risk rating 15: likelihood 3, severity 5"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Risk rating 5: likelihood 1, severity 5"),
    ).toBeInTheDocument();
  });

  it("badges each status", () => {
    renderWithMantine(<HazardTable hazards={SAFETY_CASES[0].hazards} />);
    expect(screen.getAllByText("Open")).toHaveLength(2);
    expect(screen.getByText("Mitigated")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("says so when the log is empty", () => {
    renderWithMantine(<HazardTable hazards={[]} />);
    expect(screen.getByText("No hazards in the log")).toBeInTheDocument();
  });

  it("reports the row chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <HazardTable hazards={SAFETY_CASES[0].hazards} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByText("H-02"));
    expect(onSelect).toHaveBeenCalledWith(SAFETY_CASES[0].hazards[1]);
  });
});
