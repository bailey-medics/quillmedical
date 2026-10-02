/**
 * IncidentTable Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import IncidentTable from "./IncidentTable";
import { SAFETY_CASES } from "@lib/safety";

describe("IncidentTable", () => {
  it("lists incidents newest first, with the hazard each realised", () => {
    renderWithRouter(<IncidentTable incidents={SAFETY_CASES[0].incidents} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("INC-2026-009");
    expect(rows[0]).toHaveTextContent("H-02");
    expect(rows[1]).toHaveTextContent("INC-2026-004");
  });

  it("badges the severity", () => {
    renderWithRouter(<IncidentTable incidents={SAFETY_CASES[0].incidents} />);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithRouter(<IncidentTable incidents={[]} />);
    expect(
      screen.getByText("No incidents recorded against this case"),
    ).toBeInTheDocument();
  });

  it("reports the row chosen", async () => {
    const onSelect = vi.fn();
    renderWithRouter(
      <IncidentTable
        incidents={SAFETY_CASES[0].incidents}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByText("INC-2026-004"));
    expect(onSelect).toHaveBeenCalledWith(SAFETY_CASES[0].incidents[0]);
  });

  it("shows the action given in the row above the table", () => {
    renderWithRouter(
      <IncidentTable
        incidents={SAFETY_CASES[0].incidents}
        action={<button type="button">Add incident</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add incident" }),
    ).toBeInTheDocument();
  });

  it("narrows the rows to a search", async () => {
    renderWithRouter(<IncidentTable incidents={SAFETY_CASES[0].incidents} />);
    await userEvent.click(screen.getByLabelText("Open search"));
    await userEvent.type(screen.getByLabelText("Search"), "allergy");
    expect(screen.getByText("INC-2026-009")).toBeInTheDocument();
    expect(screen.queryByText("INC-2026-004")).not.toBeInTheDocument();
  });
});
