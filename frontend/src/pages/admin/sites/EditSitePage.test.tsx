/**
 * EditSitePage tests
 *
 * This page had none. It is the one screen that can rename an org_unit, move
 * it out of use, and name or stand down its clinical lead — so the gap
 * mattered more than most.
 *
 * The clinical lead is the thing to watch. What somebody *is* at an org_unit
 * and what post they *hold* there are two facts now; standing a lead down
 * leaves the post vacant without taking the person off the org_unit, which
 * the old single "staff row with a role" could not express.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

function mockLoad(overrides: Record<string, unknown> = {}) {
  return vi
    .spyOn(apiLib.api, "get")
    .mockImplementation((path: string) =>
      path === "/users"
        ? Promise.resolve({ users: [lead, other] })
        : Promise.resolve(place(overrides)),
    );
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

  describe("Whether the place is in use", () => {
    it("is only sent when it changed", async () => {
      const user = userEvent.setup();
      mockLoad();
      vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const patch = vi.spyOn(apiLib.api, "patch").mockResolvedValue({ id: 1 });
      await renderPage();

      await user.click(screen.getByTestId("submit-button"));

      expect(patch).not.toHaveBeenCalled();
    });

    it("is sent when it changed", async () => {
      const user = userEvent.setup();
      mockLoad();
      vi.spyOn(apiLib.api, "put").mockResolvedValue({ id: 1 });
      const patch = vi.spyOn(apiLib.api, "patch").mockResolvedValue({ id: 1 });
      await renderPage();

      await user.click(screen.getByRole("switch"));
      await user.click(screen.getByTestId("submit-button"));

      // Taking an org_unit out of use asks first, so the request only goes
      // once somebody has said yes.
      await user.click(
        await screen.findByRole("button", { name: "Deactivate" }),
      );

      await waitFor(() => {
        expect(patch).toHaveBeenCalledWith("/org-units/1/active", {
          is_active: false,
        });
      });
    });
  });
});
