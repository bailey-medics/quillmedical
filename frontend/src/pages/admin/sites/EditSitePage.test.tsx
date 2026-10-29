/**
 * EditSitePage tests
 *
 * This page had none. It is the one screen that can rename an org_unit, move
 * it out of use, and name or stand down its clinical lead - so the gap
 * mattered more than most.
 *
 * The clinical lead is the thing to watch. What somebody *is* at an org_unit
 * and what post they *hold* there are two facts now; standing a lead down
 * leaves the post vacant without taking the person off the org_unit, which
 * the old single "staff row with a role" could not express.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import EditSitePage from "./EditSitePage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "1" }),
  };
});

const lead = {
  id: 7,
  username: "dr.lead",
  email: "lead@example.com",
  full_name: "Dr Ada Lead",
  capacity: "staff",
};

const other = {
  id: 8,
  username: "dr.other",
  email: "other@example.com",
  full_name: "Dr Bo Other",
  capacity: "staff",
};

function place(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Ward 1",
    type: "ward",
    type_display_name: "Ward",
    is_root: false,
    parent_id: 3,
    parent_name: "Test Trust",
    location: "Floor 2",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    members: [lead, other],
    children: [],
    features: [],
    patient_ids: [],
    clinical_lead_id: null,
    ...overrides,
  };
}

function mockLoad(overrides: Record<string, unknown> = {}, accounts = 3) {
  return vi.spyOn(apiLib.api, "get").mockImplementation((path: string) => {
    if (path === "/users") return Promise.resolve({ users: [lead, other] });
    if (path.endsWith("/deactivation")) return Promise.resolve({ accounts });

    return Promise.resolve(place(overrides));
  });
}

async function renderPage() {
  renderWithRouter(<EditSitePage />, {
    routePath: "/admin/sites/:id/edit",
    initialRoute: "/admin/sites/1/edit",
  });
  await waitFor(() => {
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
  });
}

describe("EditSitePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  describe("Loading", () => {
    it("fills the form from the place", async () => {
      mockLoad();

      await renderPage();

      expect(screen.getByLabelText(/^name/i)).toHaveValue("Ward 1");
      expect(screen.getByLabelText(/^location/i)).toHaveValue("Floor 2");
    });

    it("reports a place it cannot load", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Nope"));

      renderWithRouter(<EditSitePage />, {
        routePath: "/admin/sites/:id/edit",
        initialRoute: "/admin/sites/1/edit",
      });

      await waitFor(() => {
        expect(screen.getByText("Nope")).toBeInTheDocument();
      });
    });
  });

  describe("Saving", () => {
    it("sends the changed fields", async () => {
      const user = userEvent.setup();
      mockLoad();
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      await renderPage();

      const name = screen.getByLabelText(/^name/i);
      await user.clear(name);
      await user.type(name, "Ward 9");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(put).toHaveBeenCalledWith("/org-units/1", {
          name: "Ward 9",
          type: "ward",
          location: "Floor 2",
        });
      });
    });

    it("names a lead, and puts them on the place first", async () => {
      const user = userEvent.setup();
      mockLoad();
      vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});
      await renderPage();

      await user.click(
        screen.getByRole("combobox", { name: /clinical lead/i }),
      );
      await user.click(
        await screen.findByRole("option", {
          name: "dr.lead (lead@example.com)",
        }),
      );
      await user.click(screen.getByTestId("submit-button"));

      // Two facts, so two requests: the person is here, and the person
      // holds the post.
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/org-units/1/members", {
          user_id: 7,
          capacity: "staff",
        });
      });
      expect(apiLib.api.put).toHaveBeenCalledWith(
        "/org-units/1/clinical-lead",
        { user_id: 7 },
      );
    });

    it("stands the lead down on no clinical lead, leaving the post vacant", async () => {
      const user = userEvent.setup();
      mockLoad({ clinical_lead_id: lead.id });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});
      await renderPage();

      await user.click(
        screen.getByRole("combobox", { name: /clinical lead/i }),
      );
      await user.click(
        await screen.findByRole("option", { name: "No clinical lead" }),
      );
      await user.click(screen.getByTestId("submit-button"));

      // No person leaves the post vacant. They stay at the place: only
      // the post is given up, so nobody is added or removed.
      await waitFor(() => {
        expect(put).toHaveBeenCalledWith("/org-units/1/clinical-lead", {
          user_id: null,
        });
      });
      expect(post).not.toHaveBeenCalled();
    });

    it("shows a vacant post as no clinical lead", async () => {
      mockLoad();

      await renderPage();

      expect(
        screen.getByRole("combobox", { name: /clinical lead/i }),
      ).toHaveValue("No clinical lead");
    });

    it("leaves the post alone when the lead has not changed", async () => {
      const user = userEvent.setup();
      mockLoad({ clinical_lead_id: lead.id });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});
      await renderPage();

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(put).toHaveBeenCalledWith("/org-units/1", expect.anything());
      });
      expect(post).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalledWith(
        "/org-units/1/clinical-lead",
        expect.anything(),
      );
    });
  });

  describe("Deactivating the site", () => {
    it("has no switch on the form, and saving changes nothing about it", async () => {
      const user = userEvent.setup();
      mockLoad();
      vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const patch = vi.spyOn(apiLib.api, "patch").mockResolvedValue({ id: 1 });
      await renderPage();

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
      await user.click(screen.getByTestId("submit-button"));

      expect(patch).not.toHaveBeenCalled();
    });

    it("asks first, saying how many accounts go with it", async () => {
      const user = userEvent.setup();
      mockLoad({}, 3);
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ accounts: 3 });
      await renderPage();

      await user.click(screen.getByRole("button", { name: "Deactivate site" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(
        "Deactivating this site will also deactivate the accounts of anyone that does not belong to a second organisation or site.",
      );
      expect(
        await screen.findByText(/3 accounts will be deactivated/),
      ).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it("deactivates it once somebody says yes, and says how many went", async () => {
      const user = userEvent.setup();
      mockLoad({}, 1);
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ accounts: 1 });
      await renderPage();

      await user.click(screen.getByRole("button", { name: "Deactivate site" }));
      await screen.findByText(/1 account will be deactivated/);
      await user.click(screen.getByRole("button", { name: "Deactivate" }));

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/org-units/1/deactivate", {});
      });
      expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1", {
        state: {
          flash: {
            variant: "success",
            title: "Site deactivated",
            description: "1 account was deactivated",
          },
        },
      });
    });

    it("keeps the site when the question is cancelled", async () => {
      const user = userEvent.setup();
      mockLoad();
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ accounts: 0 });
      await renderPage();

      await user.click(screen.getByRole("button", { name: "Deactivate site" }));
      // The form has a Cancel too: this is the modal's.
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(post).not.toHaveBeenCalled();
    });

    it("offers a deactivated site making active again, bringing back no account", async () => {
      const user = userEvent.setup();
      mockLoad({ is_active: false });
      const patch = vi.spyOn(apiLib.api, "patch").mockResolvedValue({ id: 1 });
      await renderPage();

      expect(
        screen.queryByRole("button", { name: "Deactivate site" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Reactivate site" }));
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        "No account is reactivated with it",
      );
      await user.click(screen.getByRole("button", { name: "Reactivate" }));

      await waitFor(() => {
        expect(patch).toHaveBeenCalledWith("/org-units/1/active", {
          is_active: true,
        });
      });
    });
  });
});
