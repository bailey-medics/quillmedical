/**
 * Safety Sign-off Detail Page Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetySignOffDetailPage";

function renderPage(caseId: string, sectionId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/sign-off/:sectionId",
    initialRoute: `/safety/${caseId}/sign-off/${sectionId}`,
  });
}

describe("SafetySignOffDetailPage", () => {
  it("titles the page with the section and shows its overview", () => {
    renderPage("sc-001", "hazard-log");
    expect(
      screen.getByRole("heading", { level: 1, name: "Hazard log reviewed" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/reviewed line by line/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hazard log" })).toHaveAttribute(
      "href",
      "/safety/sc-001/documentation/hazard-log",
    );
  });

  it("answers an unknown section with a 404", () => {
    renderPage("sc-001", "nope");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
