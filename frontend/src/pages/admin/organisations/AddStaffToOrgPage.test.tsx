/**
 * AddStaffToOrgPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToOrgPage from "./AddStaffToOrgPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();
const mockReload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ reload: mockReload }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("AddStaffToOrgPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    mockReload.mockClear();
  });

  it("renders page title", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    expect(
      screen.getByRole("heading", { name: "Add staff member" }),
    ).toBeInTheDocument();
  });

  it("loads and displays users in select", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      users: [
        { id: 1, username: "drsmith", email: "dr.smith@test.com" },
        { id: 2, username: "nursejones", email: "nurse.jones@test.com" },
      ],
    });

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalledWith(
        "/users?permission_level=staff",
      );
    });
  });

  it("shows validation error when no user selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    const submitButton = screen.getByRole("button", {
      name: "Add staff member",
    });
    await user.click(submitButton);

    expect(screen.getByText("Please select a user")).toBeInTheDocument();
  });

  it("navigates back on cancel", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
  });

  it("shows error on API failure", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      users: [{ id: 1, username: "drsmith", email: "dr@test.com" }],
    });
    vi.spyOn(apiLib.api, "post").mockRejectedValue(
      new Error("User is already a staff member of this organisation"),
    );

    const user = userEvent.setup();

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    // Wait for users to load, then select one and submit
    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    // Click the select to open dropdown
    const selectInput = await screen.findByPlaceholderText("Search for a user");
    await user.click(selectInput);
    await user.type(selectInput, "drsmith");

    // Select the option
    const option = await screen.findByRole("option", {
      name: "drsmith (dr@test.com)",
    });
    await user.click(option);

    // Submit
    const submitButton = screen.getByRole("button", {
      name: "Add staff member",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("User is already a staff member of this organisation"),
      ).toBeInTheDocument();
    });
  });

  it("navigates to organisation on successful submission", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      users: [{ id: 1, username: "drsmith", email: "dr@test.com" }],
    });
    vi.spyOn(apiLib.api, "post").mockResolvedValue({
      organisation_id: 1,
      user_id: 1,
      username: "drsmith",
    });

    const user = userEvent.setup();

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    const selectInput = await screen.findByPlaceholderText("Search for a user");
    await user.click(selectInput);
    await user.type(selectInput, "drsmith");

    const option = await screen.findByRole("option", {
      name: "drsmith (dr@test.com)",
    });
    await user.click(option);

    const submitButton = screen.getByRole("button", {
      name: "Add staff member",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
    });

    expect(mockReload).toHaveBeenCalledOnce();
  });

  it("shows error when user loading fails", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(
      new Error("Failed to load users"),
    );

    renderWithRouter(<AddStaffToOrgPage />, {
      routePath: "/admin/organisations/:id/add-staff",
      initialRoute: "/admin/organisations/1/add-staff",
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load users")).toBeInTheDocument();
    });
  });
});
