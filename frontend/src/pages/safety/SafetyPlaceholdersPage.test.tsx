/**
 * Placeholders page tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { resetEdits, setPlaceholderValue } from "@lib/safety";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyPlaceholdersPage";

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
    routePath: "/safety/:caseId/placeholders",
    initialRoute: `/safety/${caseId}/placeholders`,
  });
}

describe("SafetyPlaceholdersPage", () => {
  afterEach(() => resetEdits());

  it("titles the page and names the case, with no link back", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Placeholders" }),
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

  it("offers an edit button that opens the edit page", async () => {
    renderPage("sc-001");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit placeholders" }),
    );
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/placeholders/edit");
  });

  it("shows an edited value from the session store", () => {
    setPlaceholderValue("sc-001", "product_version", "4.3");
    renderPage("sc-001");
    expect(screen.getByText("4.3")).toBeInTheDocument();
  });
});
