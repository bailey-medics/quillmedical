/**
 * Safety Document Page Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyDocumentPage";

function renderPage(caseId: string, documentId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/documentation/:documentId",
    initialRoute: `/safety/${caseId}/documentation/${documentId}`,
  });
}

describe("SafetyDocumentPage", () => {
  it("titles the page with the document and renders it as a sheet", () => {
    renderPage("sc-001", "cscr");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Clinical safety case report",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("safety-document-sheet")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "1. Summary" }),
    ).toBeInTheDocument();
  });

  it("fills the case's placeholders into the document", () => {
    renderPage("sc-002", "crmp");
    expect(screen.getAllByText(/Northgate Digital/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it("answers an unknown document with a 404", () => {
    renderPage("sc-001", "nope");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999", "crmp");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
