/**
 * AdminSitesPage tests
 *
 * The list shows the places inside organisations, never the
 * organisations themselves — they have their own page. The interesting
 * case is a site whose owner the person cannot see: it still belongs in
 * the list, because they may administer the site itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AdminSitesPage from "./AdminSitesPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function place(over: Record<string, unknown>) {
  return {
    id: 1,
    name: "Ward 1",
    type: "ward",
    type_display_name: "Ward",
    is_root: false,
    parent_id: 10,
    location: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const trust = place({
  id: 10,
  name: "Test Trust",
  type: "organisation",
  type_display_name: "Organisation",
  is_root: true,
  parent_id: null,
});

const ward = place({ id: 1, name: "Ward 1", location: "Floor 2" });

const clinic = place({
  id: 2,
  name: "Eye clinic",
  type: "clinic",
  type_display_name: "Clinic",
  parent_id: 10,
});

function mockList(org_units: unknown[]) {
  return vi.spyOn(apiLib.api, "get").mockResolvedValue({ org_units });
}

describe("AdminSitesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  describe("What it lists", () => {
    it("shows the places inside organisations", async () => {
      mockList([trust, ward, clinic]);

      renderWithRouter(<AdminSitesPage />);

      await waitFor(() => {
        expect(screen.getByText("Ward 1")).toBeInTheDocument();
      });
      expect(screen.getByText("Eye clinic")).toBeInTheDocument();
    });

    it("leaves the organisations out", async () => {
      mockList([trust, ward]);

      renderWithRouter(<AdminSitesPage />);

      await waitFor(() => {
        expect(screen.getByText("Ward 1")).toBeInTheDocument();
      });
      // Named as the owner of Ward 1, and not as a row of its own.
      expect(screen.getAllByText("Test Trust")).toHaveLength(1);
    });

    it("names the place each one sits inside", async () => {
      mockList([trust, ward]);

      renderWithRouter(<AdminSitesPage />);

      await waitFor(() => {
        expect(screen.getByText("Test Trust")).toBeInTheDocument();
      });
    });

    it("says so when the owner is not one it can see", async () => {
      // Somebody may administer a ward without administering the trust
      // above it. Hiding the ward would be worse than not naming its
      // owner.
      mockList([ward]);

      renderWithRouter(<AdminSitesPage />);

      await waitFor(() => {
        expect(screen.getByText("Ward 1")).toBeInTheDocument();
      });
      expect(screen.getByText("Not known")).toBeInTheDocument();
    });

    it("reports a list it cannot load", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Nope"));

      renderWithRouter(<AdminSitesPage />);

      await waitFor(() => {
        expect(screen.getByText("Nope")).toBeInTheDocument();
      });
    });
  });

  describe("Getting somewhere", () => {
    it("opens a site when its row is clicked", async () => {
      const user = userEvent.setup();
      mockList([trust, ward]);

      renderWithRouter(<AdminSitesPage />);
      await waitFor(() => {
        expect(screen.getByText("Ward 1")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Ward 1"));

      expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1");
    });

    it("offers adding one", async () => {
      const user = userEvent.setup();
      mockList([trust]);

      renderWithRouter(<AdminSitesPage />);

      await user.click(
        await screen.findByRole("button", { name: /add site/i }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/new");
    });
  });
});
