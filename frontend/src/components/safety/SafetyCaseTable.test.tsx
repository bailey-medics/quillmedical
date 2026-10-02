/**
 * SafetyCaseTable Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SafetyCaseTable from "./SafetyCaseTable";
import { SAFETY_CASES } from "@lib/safety";

describe("SafetyCaseTable", () => {
  it("lists every case in the order given", () => {
    renderWithMantine(<SafetyCaseTable cases={SAFETY_CASES} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("Electronic prescribing module");
    expect(rows[4]).toHaveTextContent("Discharge letter generator");
  });

  it("shows the system, standard, officer and status", () => {
    renderWithMantine(<SafetyCaseTable cases={[SAFETY_CASES[0]]} />);
    expect(screen.getByText("MedScribe EPMA 4.2")).toBeInTheDocument();
    expect(screen.getByText("DCB0129")).toBeInTheDocument();
    expect(screen.getByText("Dr Hannah Okafor")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
  });

  it("counts only the open hazards", () => {
    renderWithMantine(<SafetyCaseTable cases={[SAFETY_CASES[0]]} />);
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveTextContent("2");
  });

  it("says so when there are none", () => {
    renderWithMantine(<SafetyCaseTable cases={[]} />);
    expect(screen.getByText("No safety cases")).toBeInTheDocument();
  });

  it("reports the case chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <SafetyCaseTable cases={SAFETY_CASES} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByText("Patient portal"));
    expect(onSelect).toHaveBeenCalledWith(SAFETY_CASES[1]);
  });
});
