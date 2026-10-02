/**
 * Safety Hazard Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyHazardPage";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

function renderPage(caseId: string, hazardId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/hazards/:hazardId",
    initialRoute: `/safety/${caseId}/hazards/${hazardId}`,
  });
}

describe("SafetyHazardPage", () => {
  beforeEach(() => navigate.mockClear());

  it("titles the page with the hazard and shows its risk in full", () => {
    renderPage("sc-001", "H-02");
    expect(
      screen.getByRole("heading", { level: 1, name: "Hazard H-02" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Likelihood 2 of 5, low")).toBeInTheDocument();
    expect(
      screen.getByText("Severity 5 of 5, catastrophic"),
    ).toBeInTheDocument();
  });

  it("lists only the incidents that realised this hazard, and opens one", async () => {
    renderPage("sc-001", "H-02");
    expect(screen.getByText("INC-2026-009")).toBeInTheDocument();
    expect(screen.queryByText("INC-2026-004")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("INC-2026-009"));
    expect(navigate).toHaveBeenCalledWith(
      "/safety/sc-001/incidents/INC-2026-009",
    );
  });

  it("answers an unknown hazard with a 404", () => {
    renderPage("sc-001", "H-99");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
