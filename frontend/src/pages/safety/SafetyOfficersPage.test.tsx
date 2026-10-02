/**
 * Officers page tests
 */

import { afterEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { resetEdits } from "@lib/safety";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as Page } from "./SafetyOfficersPage";

function renderPage(caseId: string) {
  return renderWithRouter(<Page />, {
    routePath: "/safety/:caseId/officers",
    initialRoute: `/safety/${caseId}/officers`,
  });
}

describe("SafetyOfficersPage", () => {
  afterEach(() => resetEdits());

  it("titles the page and names the case, with no link back", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Officers" }),
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
    expect(screen.getByText("Dr Hannah Okafor")).toBeInTheDocument();
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Officers" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("edits an officer and shows the change", async () => {
    renderPage("sc-001");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit product owner" }),
    );
    const name = screen.getByLabelText(/Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Jo Fletcher");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Jo Fletcher")).toBeInTheDocument();
    expect(screen.queryByText("Sarah Lindqvist")).not.toBeInTheDocument();
    expect(
      screen.getByText(/kept only until the page is reloaded/),
    ).toBeInTheDocument();
  });
});
