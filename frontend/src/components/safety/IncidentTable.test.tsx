/**
 * IncidentTable Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import IncidentTable from "./IncidentTable";
import { SAFETY_CASES } from "@lib/safety";

describe("IncidentTable", () => {
  it("lists incidents newest first, with the hazard each realised", () => {
    renderWithMantine(<IncidentTable incidents={SAFETY_CASES[0].incidents} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("INC-2026-009");
    expect(rows[0]).toHaveTextContent("H-02");
    expect(rows[1]).toHaveTextContent("INC-2026-004");
  });

  it("badges the severity", () => {
    renderWithMantine(<IncidentTable incidents={SAFETY_CASES[0].incidents} />);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithMantine(<IncidentTable incidents={[]} />);
    expect(
      screen.getByText("No incidents recorded against this case"),
    ).toBeInTheDocument();
  });
});
