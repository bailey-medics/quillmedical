/**
 * Safety Document Edit Page Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { documentContentOf, resetEdits } from "@lib/safety";
import { Component as Page } from "./SafetyDocumentEditPage";

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
    routePath: "/safety/:caseId/documentation/:documentId/edit",
    initialRoute: `/safety/${caseId}/documentation/${documentId}/edit`,
  });
}

describe("SafetyDocumentEditPage", () => {
  beforeEach(() => navigate.mockClear());
  afterEach(() => resetEdits());

  it("titles the page and starts from the document's markdown", () => {
    renderPage("sc-001", "crmp");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Edit clinical risk management plan",
      }),
    ).toBeInTheDocument();
    const field = screen.getByLabelText(/Document/) as HTMLTextAreaElement;
    expect(field.value).toContain("{{ product_name }}");
  });

  it("saves into the session store and returns to the document", async () => {
    renderPage("sc-001", "crmp");
    const field = screen.getByLabelText(/Document/);
    await userEvent.clear(field);
    await userEvent.type(field, "## Rewritten");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(documentContentOf("sc-001", "crmp")).toBe("## Rewritten");
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/documentation/crmp");
  });

  it("answers an unknown document with a 404", () => {
    renderPage("sc-001", "nope");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
