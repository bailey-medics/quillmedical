/**
 * Safety Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as SafetyPage } from "./SafetyPage";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

describe("SafetyPage", () => {
  beforeEach(() => navigate.mockClear());

  it("titles the page and says the cases are a demonstration", () => {
    renderWithRouter(<SafetyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Safety" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Demonstration safety cases/)).toBeInTheDocument();
  });

  it("shows an Add safety case button, for show only", () => {
    renderWithRouter(<SafetyPage />);
    expect(
      screen.getByRole("button", { name: "Add safety case" }),
    ).toBeInTheDocument();
  });

  it("lists the five cases", () => {
    renderWithRouter(<SafetyPage />);
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(5);
  });

  it("opens a case when its row is chosen", async () => {
    renderWithRouter(<SafetyPage />);
    await userEvent.click(screen.getByText("Patient portal"));
    expect(navigate).toHaveBeenCalledWith("/safety/sc-002");
  });
});
