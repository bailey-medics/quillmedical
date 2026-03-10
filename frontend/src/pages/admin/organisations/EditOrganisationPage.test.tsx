/**
 * EditOrganisationPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import EditOrganisationPage from "./EditOrganisationPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockOrganisation = {
  id: 1,
  name: "Test Hospital",
  type: "hospital_team",
  location: "London",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

describe("EditOrganisationPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders page title", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Edit organisation" }),
      ).toBeInTheDocument();
    });
  });

  it("loads and displays current organisation details", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
      expect(screen.getByDisplayValue("London")).toBeInTheDocument();
    });
  });

  it("shows error when organisation fails to load", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(
      new Error("Organisation not found"),
    );

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByText("Organisation not found")).toBeInTheDocument();
    });
  });

  it("shows validation error when name is empty", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Test Hospital");
    await user.clear(nameInput);

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await user.click(submitButton);

    expect(
      screen.getByText("Organisation name is required"),
    ).toBeInTheDocument();
  });

  it("navigates back on cancel", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
  });

  it("submits updated data to API", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);
    vi.spyOn(apiLib.api, "put").mockResolvedValue({
      ...mockOrganisation,
      name: "Updated Hospital",
    });

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Test Hospital");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Hospital");

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiLib.api.put).toHaveBeenCalledWith("/organizations/1", {
        name: "Updated Hospital",
        type: "hospital_team",
        location: "London",
      });
    });
  });

  it("shows success message after update", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);
    vi.spyOn(apiLib.api, "put").mockResolvedValue(mockOrganisation);

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Organisation updated")).toBeInTheDocument();
    });
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);
    vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("Server error"));

    renderWithRouter(<EditOrganisationPage />, {
      routePath: "/admin/organisations/:id/edit",
      initialRoute: "/admin/organisations/1/edit",
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Hospital")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});
