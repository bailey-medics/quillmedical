/**
 * SiteAdminPage clinical lead tests
 *
 * The clinical lead shown here comes from the site's clinical lead post,
 * not from a role on a staff row. The distinction matters: a post can be
 * vacant, which is a real state worth chasing, where a missing role is
 * indistinguishable from a site that never needed a lead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import SiteAdminPage from "./SiteAdminPage";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
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

const mockAdminUser: User = {
  id: "3",
  username: "admin.user",
  email: "admin@example.com",
  system_permissions: "admin",
};

const lead = {
  id: 7,
  username: "dr.lead",
  email: "lead@example.com",
  full_name: "Dr Ada Lead",
  role: "staff",
};

const site = (clinicalLeadId: number | null) => ({
  id: 1,
  name: "Ward 1",
  type: "ward",
  parent_id: null,
  location: "",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  staff: [lead],
  organisations: [],
  clinical_lead_id: clinicalLeadId,
});

describe("SiteAdminPage clinical lead", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();

    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: { status: "authenticated", user: mockAdminUser },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
  });

  /**
   * The name also appears in the staff list below, so every assertion is
   * scoped to the clinical lead field rather than the whole page.
   */
  async function clinicalLeadField(): Promise<HTMLElement> {
    const label = await screen.findByText("Clinical lead:");
    return label.parentElement as HTMLElement;
  }

  it("names the holder of the clinical lead post", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(site(7));

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    const field = await clinicalLeadField();
    await waitFor(() => {
      expect(within(field).getByText("Dr Ada Lead")).toBeInTheDocument();
    });
  });

  it("reports a vacant post as not assigned", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(site(null));

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    const field = await clinicalLeadField();
    expect(within(field).getByText("Not assigned")).toBeInTheDocument();
  });

  it("ignores a staff row whose role says clinical lead", async () => {
    // The check that proves the display reads the post. Before this
    // change, a role of "clinical_lead" here would have named them.
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...site(null),
      staff: [{ ...lead, role: "clinical_lead" }],
    });

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    const field = await clinicalLeadField();
    expect(within(field).getByText("Not assigned")).toBeInTheDocument();
    expect(within(field).queryByText("Dr Ada Lead")).not.toBeInTheDocument();
  });
});
