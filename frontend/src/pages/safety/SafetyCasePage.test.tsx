/**
 * Safety Case Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as SafetyCasePage } from "./SafetyCasePage";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

function renderCase(caseId: string) {
  return renderWithRouter(<SafetyCasePage />, {
    routePath: "/safety/:caseId",
    initialRoute: `/safety/${caseId}`,
  });
}

describe("SafetyCasePage", () => {
  beforeEach(() => navigate.mockClear());

  it("titles the page with the case and shows its status", () => {
    renderCase("sc-001");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Electronic prescribing module",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(
      screen.getByText("Tessaly EPMA 4.2, assessed against DCB0129."),
    ).toBeInTheDocument();
  });

  it("offers the six cards in order, with counts from the case", () => {
    renderCase("sc-001");
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Documentation",
      "Hazards",
      "Incidents",
      "Officers",
      "Compliance sign-off",
      "Placeholders",
    ]);
    expect(
      screen.getByText("2 open hazards of 4 in the log."),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 4 sections signed.")).toBeInTheDocument();
  });

  it("opens a card's page", async () => {
    renderCase("sc-001");
    await userEvent.click(
      screen.getByRole("button", { name: "Open hazard log" }),
    );
    expect(navigate).toHaveBeenCalledWith("/safety/sc-001/hazards");
  });

  it("answers an unknown case with a 404", () => {
    renderCase("sc-999");
    expect(screen.queryByText("Documentation")).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });
});
