/**
 * Placeholders page tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyPlaceholdersPage";

function renderPage(caseId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/placeholders",
    initialRoute: `/safety/${caseId}/placeholders`,
  });
}

describe("SafetyPlaceholdersPage", () => {
  it("titles the page and links back to the case", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Placeholders" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Electronic prescribing module" }),
    ).toHaveAttribute("href", "/safety/sc-001");
  });

  it("shows the case's content", () => {
    renderPage("sc-001");
    expect(screen.getByText("{{ product_name }}")).toBeInTheDocument();
    expect(
      screen.getByText(/A placeholder is a value written once/),
    ).toBeInTheDocument();
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Placeholders" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
