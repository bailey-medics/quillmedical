/**
 * IncidentReport Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import IncidentReport from "./IncidentReport";
import { SAFETY_CASES, hazardById } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];
const incident = safetyCase.incidents[1]; // INC-2026-009, high, H-02

describe("IncidentReport", () => {
  it("shows what happened, its severity and who reported it", () => {
    renderWithRouter(
      <IncidentReport
        incident={incident}
        hazard={hazardById(safetyCase, incident.hazard_id)}
        hazardHref="/safety/sc-001/hazards/H-02"
      />,
    );
    expect(screen.getByText(incident.summary)).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(
      screen.getByText(/reported by prescribing clinician/),
    ).toBeInTheDocument();
  });

  it("links to the hazard it realised", () => {
    renderWithRouter(
      <IncidentReport
        incident={incident}
        hazard={hazardById(safetyCase, incident.hazard_id)}
        hazardHref="/safety/sc-001/hazards/H-02"
      />,
    );
    expect(
      screen.getByRole("link", {
        name: "H-02: Allergy alert suppressed after a session timeout",
      }),
    ).toHaveAttribute("href", "/safety/sc-001/hazards/H-02");
  });

  it("shows the immediate action, root cause and outcome", () => {
    renderWithRouter(
      <IncidentReport
        incident={incident}
        hazardHref="/safety/sc-001/hazards/H-02"
      />,
    );
    expect(screen.getByText(incident.immediate_action)).toBeInTheDocument();
    expect(screen.getByText(incident.root_cause)).toBeInTheDocument();
    expect(screen.getByText(incident.outcome)).toBeInTheDocument();
    // Without the hazard, the reference alone is the link text
    expect(screen.getByRole("link", { name: "H-02" })).toBeInTheDocument();
  });
});
