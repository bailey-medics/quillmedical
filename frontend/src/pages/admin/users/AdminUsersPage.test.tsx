/**
 * Admin Users Page Tests
 *
 * The page's own job is the wiring: fetching the users, offering the way
 * to add one, and opening a user from a row.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AdminUsersPage from "./AdminUsersPage";

const navigate = vi.fn();
const get = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

describe("AdminUsersPage", () => {
  beforeEach(() => {
    navigate.mockClear();
    get.mockResolvedValue({
      users: [
        {
          id: 1,
          username: "ada.lovelace",
          email: "ada@example.com",
          full_name: "Ada Lovelace",
          platform_role: "standard",
          is_active: true,
          organisations: ["Wessex Valley"],
          sites: [],
        },
      ],
    });
  });

  it("lists the users once loaded, with full name, username and status only", async () => {
    renderWithRouter(<AdminUsersPage />);
    expect(await screen.findByText("ada.lovelace")).toBeInTheDocument();
    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim());
    expect(headers).toEqual(["Full name", "Username", "Status"]);
    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
  });

  it("still finds a user by email, which is searched though not shown", async () => {
    renderWithRouter(<AdminUsersPage />);
    await screen.findByText("ada.lovelace");
    await userEvent.click(screen.getByLabelText("Open search"));
    await userEvent.type(screen.getByLabelText("Search"), "ada@example");
    expect(screen.getByText("ada.lovelace")).toBeInTheDocument();
  });

  it("offers Add user as an icon in the table's row, not in the header", async () => {
    renderWithRouter(<AdminUsersPage />);
    await screen.findByText("ada.lovelace");
    const add = screen.getByRole("button", { name: "Add user" });
    expect(add).toHaveTextContent("");
    expect(add.querySelector("svg.tabler-icon-user-plus")).toBeInTheDocument();
    await userEvent.click(add);
    expect(navigate).toHaveBeenCalledWith("/admin/users/new");
  });

  it("opens a user from their row", async () => {
    renderWithRouter(<AdminUsersPage />);
    await userEvent.click(await screen.findByText("ada.lovelace"));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/admin/users/1"),
    );
  });
});
