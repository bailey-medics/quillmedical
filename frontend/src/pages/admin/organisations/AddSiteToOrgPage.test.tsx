/**
 * AddSiteToOrgPage tests
 *
 * Creating a site inside an organisation. Somebody who may appoint staff
 * to posts, or a scoped manager such as a teaching admin, names its
 * clinical lead as they do; anybody else leaves the post vacant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as apiLib from "@/lib/api";
import AddSiteToOrgPage from "./AddSiteToOrgPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const viewer: User = {
  id: "3",
  username: "admin.user",
  email: "admin@example.com",
  competencies: [],
};

function signedInWith(competencies: string[]) {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: {
      status: "authenticated",
      user: { ...viewer, competencies },
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

function renderPage() {
  renderWithRouter(<AddSiteToOrgPage />, {
    routePath: "/admin/organisations/:id/add-site",
    initialRoute: "/admin/organisations/1/add-site",
  });
}

async function fillInAndCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByRole("textbox", { name: "Name" }),
    "Ward 9",
  );
  await user.click(screen.getByRole("combobox", { name: "Type" }));
  await user.click(await screen.findByRole("option", { name: "Ward" }));
  await user.click(screen.getByRole("button", { name: "Create site" }));
}

describe("AddSiteToOrgPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  describe("for a teaching admin", () => {
    it("offers a clinical lead from the people they may see", async () => {
      signedInWith(["manage_teaching"]);
      const get = vi.spyOn(apiLib.api, "get").mockResolvedValue({
        users: [{ id: 4, username: "dr.lead", email: "lead@example.com" }],
      });

      renderPage();

      expect(
        await screen.findByRole("combobox", { name: "Clinical lead" }),
      ).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith("/users");
    });

    it("creates the site inside the organisation and goes back to it", async () => {
      const user = userEvent.setup();
      signedInWith(["manage_teaching"]);
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ id: 9, name: "Ward 9" });

      renderPage();
      await fillInAndCreate(user);

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith("/org-units", {
          name: "Ward 9",
          type: "ward",
          parent_id: 1,
          location: null,
        }),
      );
      expect(post).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(
          "/admin/organisations/1",
          expect.anything(),
        ),
      );
    });

    it("names the clinical lead they picked once the site exists", async () => {
      const user = userEvent.setup();
      signedInWith(["manage_teaching"]);
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        users: [{ id: 4, username: "dr.lead", email: "lead@example.com" }],
      });
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ id: 9, name: "Ward 9" });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({});

      renderPage();
      await user.click(
        await screen.findByRole("combobox", { name: "Clinical lead" }),
      );
      await user.click(
        await screen.findByRole("option", {
          name: "dr.lead (lead@example.com)",
        }),
      );
      await fillInAndCreate(user);

      await waitFor(() =>
        expect(put).toHaveBeenCalledWith("/org-units/9/clinical-lead", {
          user_id: 4,
        }),
      );
      expect(post).toHaveBeenCalledWith("/org-units/9/members", {
        user_id: 4,
        capacity: "staff",
      });
    });
  });

  describe("for somebody who may do neither", () => {
    it("offers no clinical lead and does not ask for the users", async () => {
      signedInWith(["manage_patient_membership"]);
      const get = vi.spyOn(apiLib.api, "get");

      renderPage();

      expect(
        await screen.findByRole("textbox", { name: "Name" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Clinical lead" }),
      ).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe("for an administrator", () => {
    it("offers a clinical lead from the users", async () => {
      signedInWith(["manage_users", "manage_staff_membership"]);
      const get = vi.spyOn(apiLib.api, "get").mockResolvedValue({
        users: [{ id: 4, username: "dr.lead", email: "lead@example.com" }],
      });

      renderPage();

      expect(
        await screen.findByRole("combobox", { name: "Clinical lead" }),
      ).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith("/users");
    });

    it("says when the site could not be created", async () => {
      const user = userEvent.setup();
      signedInWith(["manage_users"]);
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });
      vi.spyOn(apiLib.api, "post").mockRejectedValue(new Error("HTTP 500"));

      renderPage();
      await fillInAndCreate(user);

      expect(
        await screen.findByText("Failed to create site"),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
