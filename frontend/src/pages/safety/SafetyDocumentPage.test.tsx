/**
 * Safety Document Page Tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  resetEdits,
  setDocumentContent,
  setPlaceholderValue,
} from "@lib/safety";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyDocumentPage";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

function renderPage(caseId: string, documentId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/documentation/:documentId",
    initialRoute: `/safety/${caseId}/documentation/${documentId}`,
  });
}

describe("SafetyDocumentPage", () => {
  afterEach(() => resetEdits());

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
    expect(screen.getAllByText(/Wexcombe Digital/).length).toBeGreaterThan(0);
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

  it("renders an edited placeholder value", () => {
    setPlaceholderValue("sc-001", "supplier_name", "Acme Clinical Systems");
    renderPage("sc-001", "crmp");
    expect(screen.getAllByText(/Acme Clinical Systems/).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Tessaly Health Ltd/)).not.toBeInTheDocument();
  });

  it("offers an edit button that opens the edit page", async () => {
    renderPage("sc-001", "crmp");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit document" }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/safety/sc-001/documentation/crmp/edit",
    );
  });

  it("renders edited markdown, with placeholders still filled", () => {
    setDocumentContent(
      "sc-001",
      "crmp",
      "## Rewritten\n\nNow about {{ product_name }} only.",
    );
    renderPage("sc-001", "crmp");
    expect(
      screen.getByRole("heading", { name: "Rewritten" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Now about Tessaly EPMA only."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "2. Scope" }),
    ).not.toBeInTheDocument();
  });
});
