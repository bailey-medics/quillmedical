/**
 * Placeholders edit page tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { placeholdersOf, resetEdits } from "@lib/safety";
import { Component as Page } from "./SafetyPlaceholdersEditPage";

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
    routePath: "/safety/:caseId/placeholders/edit",
    initialRoute: `/safety/${caseId}/placeholders/edit`,
  });
}

describe("SafetyPlaceholdersEditPage", () => {
  beforeEach(() => navigate.mockClear());
  afterEach(() => resetEdits());

  it("titles the page and offers every placeholder", () => {
    renderPage("sc-001");
    expect(
      screen.getByRole("heading", { level: 1, name: "Edit placeholders" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(5);
  });

  it("saves into the session store and returns to the placeholders page", async () => {
    renderPage("sc-001");
    const interval = screen.getByLabelText(/\{\{ review_interval \}\}/);
    await userEvent.clear(interval);
    await userEvent.type(interval, "6 months");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      placeholdersOf("sc-001").find((p) => p.key === "review_interval")?.value,
    ).toBe("6 months");
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/placeholders");
  });

  it("cancels back to the placeholders page without saving", async () => {
    renderPage("sc-001");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/placeholders");
    expect(placeholdersOf("sc-001")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "review_interval", value: "12 months" }),
      ]),
    );
  });

  it("answers an unknown case with a 404", () => {
    renderPage("sc-999");
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
