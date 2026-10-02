/**
 * Safety Incident Page Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyIncidentPage";

function renderPage(caseId: string, incidentId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/incidents/:incidentId",
    initialRoute: `/safety/${caseId}/incidents/${incidentId}`,
  });
}

describe("SafetyIncidentPage", () => {
  it("titles the page with the incident and links to its hazard", () => {
    renderPage("sc-001", "INC-2026-004");
    expect(
      screen.getByRole("heading", { level: 1, name: "Incident INC-2026-004" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "H-03: Duplicate order created on a double submit",
      }),
    ).toHaveAttribute("href", "/safety/sc-001/hazards/H-03");
  });

  it("answers an unknown incident with a 404", () => {
    renderPage("sc-001", "INC-9999-999");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("shows a button, for show only", () => {
    renderPage("sc-001", "INC-2026-009");
    expect(
      screen.getByRole("button", { name: "Edit incident" }),
    ).toBeInTheDocument();
  });
});
