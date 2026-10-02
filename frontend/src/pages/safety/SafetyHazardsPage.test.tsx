/**
 * Hazards page tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyHazardsPage";

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
});
