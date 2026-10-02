/**
 * Hazards page tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyHazardsPage";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

function renderPage(caseId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/hazards",
    initialRoute: `/safety/${caseId}/hazards`,
  });
}

describe("SafetyHazardsPage", () => {
  it("titles the page and names the case, with no link back", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Hazards" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Electronic prescribing module"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Electronic prescribing module" }),
    ).not.toBeInTheDocument();
  });

  it("shows the case's content", () => {
    renderPage("sc-001");
    expect(screen.getByText("H-01")).toBeInTheDocument();
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Hazards" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("opens a hazard when its row is chosen", async () => {
    renderPage("sc-001");
    await userEvent.click(screen.getByText("H-02"));
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/hazards/H-02");
  });

  it("shows an button, for show only", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("button", { name: "Add hazard" }),
    ).toBeInTheDocument();
  });
});
