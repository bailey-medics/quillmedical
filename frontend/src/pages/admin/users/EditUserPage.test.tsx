/**
 * Edit User Page Tests
 *
 * The page is a picker: it fetches the users, lists them, and opens the
 * edit form for the one chosen. So the tests are of the four things it
 * can show, and of where a row leads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import EditUserPage from "./EditUserPage";

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

const users = [
  { id: "7", username: "ada.lovelace", email: "ada@example.com" },
  { id: "12", username: "grace.hopper", email: "grace@example.com" },
];

describe("EditUserPage", () => {
  beforeEach(() => {
    navigate.mockClear();
    get.mockReset();
    get.mockResolvedValue({ users });
  });

  it("asks the API for the users", async () => {
    renderWithRouter(<EditUserPage />);

    await screen.findByText("ada.lovelace");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/users");
  });

  it("lists each user with their username and email", async () => {
    renderWithRouter(<EditUserPage />);

    expect(await screen.findByText("ada.lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper")).toBeInTheDocument();
    expect(screen.getByText("grace@example.com")).toBeInTheDocument();
  });

  it("shows no table and no message while the users are loading", () => {
    get.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<EditUserPage />);

    expect(screen.getByText("Edit user")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No users found")).not.toBeInTheDocument();
  });

  it("opens the edit form of the user whose button is pressed", async () => {
    const user = userEvent.setup();
    renderWithRouter(<EditUserPage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit grace.hopper" }),
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/admin/users/12/edit");
  });

  it("gives each user an edit button of their own", async () => {
    renderWithRouter(<EditUserPage />);

    await screen.findByText("ada.lovelace");

    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(2);
  });

  it("says so when there are no users", async () => {
    get.mockResolvedValue({ users: [] });

    renderWithRouter(<EditUserPage />);

    expect(await screen.findByText("No users found")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("treats a reply with no list in it as no users", async () => {
    get.mockResolvedValue({});

    renderWithRouter(<EditUserPage />);

    expect(await screen.findByText("No users found")).toBeInTheDocument();
  });

  it("shows the error when the users cannot be fetched", async () => {
    get.mockRejectedValue(new Error("Network down"));

    renderWithRouter(<EditUserPage />);

    expect(await screen.findByText("Error loading users")).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a general error when what was thrown is not an Error", async () => {
    get.mockRejectedValue("nope");

    renderWithRouter(<EditUserPage />);

    expect(await screen.findByText("Unknown error")).toBeInTheDocument();
  });
});
