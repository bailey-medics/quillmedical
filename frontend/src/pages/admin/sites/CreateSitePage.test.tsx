/**
 * CreateSitePage tests
 *
 * The point of this page is the question the old flow never asked: what
 * does the new site sit inside? So the tests are mostly about the parent
 * — that it is offered, that it is required, and that it is what gets
 * sent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import CreateSitePage from "./CreateSitePage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const trust = {
  id: 10,
  name: "Test Trust",
  type: "organisation",
  type_display_name: "Organisation",
  is_root: true,
  parent_id: null,
  location: "",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const building = {
  ...trust,
  id: 11,
  name: "Main building",
  type: "building",
  type_display_name: "Building",
  is_root: false,
  parent_id: 10,
};

function mockPlaces() {
  return vi
    .spyOn(apiLib.api, "get")
    .mockResolvedValue({ org_units: [trust, building] });
}

async function renderPage() {
  renderWithRouter(<CreateSitePage />);
  await waitFor(() => {
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
  });
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  option: RegExp,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("CreateSitePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  describe("Choosing where it sits", () => {
    it("offers every place, not only the organisations", async () => {
      const user = userEvent.setup();
      mockPlaces();
      await renderPage();

      await user.click(screen.getByRole("combobox", { name: /inside/i }));

      // A ward can go inside a building, which the old organisation-side
      // form could not express.
      expect(
        await screen.findByRole("option", { name: /Main building/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Test Trust/ }),
      ).toBeInTheDocument();
    });

    it("refuses to create one that sits nowhere", async () => {
      const user = userEvent.setup();
      mockPlaces();
      const post = vi.spyOn(apiLib.api, "post");
      await renderPage();

      await user.type(screen.getByLabelText(/^name/i), "Ward 12");
      await pick(user, /type/i, /^Ward$/);
      await user.click(screen.getByTestId("submit-button"));

      // The form will not submit until it has been told where the site
      // goes, so nothing is sent for the server to reject.
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe("Creating one", () => {
    it("sends what was filled in, and opens the new site", async () => {
      const user = userEvent.setup();
      mockPlaces();
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ id: 42, name: "Ward 12" });
      await renderPage();

      await pick(user, /inside/i, /Main building/);
      await user.type(screen.getByLabelText(/^name/i), "Ward 12");
      await pick(user, /type/i, /^Ward$/);
      await user.type(screen.getByLabelText(/^location/i), "Floor 2");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/org-units", {
          name: "Ward 12",
          type: "ward",
          parent_id: 11,
          location: "Floor 2",
        });
      });
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/sites/42",
        expect.anything(),
      );
    });

    it("sends no location rather than an empty one", async () => {
      const user = userEvent.setup();
      mockPlaces();
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ id: 42, name: "Ward 12" });
      await renderPage();

      await pick(user, /inside/i, /Test Trust/);
      await user.type(screen.getByLabelText(/^name/i), "Ward 12");
      await pick(user, /type/i, /^Ward$/);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          "/org-units",
          expect.objectContaining({ location: null }),
        );
      });
    });

    it("says so when the server refuses", async () => {
      const user = userEvent.setup();
      mockPlaces();
      vi.spyOn(apiLib.api, "post").mockRejectedValue(
        new Error("A ward sits inside something"),
      );
      await renderPage();

      await pick(user, /inside/i, /Test Trust/);
      await user.type(screen.getByLabelText(/^name/i), "Ward 12");
      await pick(user, /type/i, /^Ward$/);
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByText("A ward sits inside something"),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Loading", () => {
    it("reports places it cannot load", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Nope"));

      renderWithRouter(<CreateSitePage />);

      await waitFor(() => {
        expect(screen.getByText("Nope")).toBeInTheDocument();
      });
    });
  });
});
