/**
 * Compliance sign-off page tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetySignOffPage";

function renderPage(caseId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/sign-off",
    initialRoute: `/safety/${caseId}/sign-off`,
  });
}

describe("SafetySignOffPage", () => {
  it("titles the page and names the case, with no link back", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Compliance sign-off" }),
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
    expect(screen.getAllByText("Awaiting signature")).toHaveLength(2);
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Compliance sign-off" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("makes each section a link to its own page", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("link", { name: "Open Top management approval" }),
    ).toHaveAttribute("href", "/safety/sc-001/sign-off/approval");
  });
});
