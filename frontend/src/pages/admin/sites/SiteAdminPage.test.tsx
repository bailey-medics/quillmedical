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
import userEvent from "@testing-library/user-event";
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
};

const lead = {
  id: 7,
  username: "dr.lead",
  email: "lead@example.com",
  full_name: "Dr Ada Lead",
  capacity: "staff",
};

const site = (clinicalLeadId: number | null) => ({
  id: 1,
  name: "Ward 1",
  type: "ward",
  type_display_name: "Ward",
  is_root: false,
  parent_id: null,
  parent_name: "",
  location: "",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  members: [lead],
  children: [],
  features: [],
  patient_ids: [],
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

describe("SiteAdminPage staff members", () => {
  function signedIn(competencies: string[]) {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: { ...mockAdminUser, competencies } as User,
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...site(null),
      members: [{ ...lead, authorised_here: 3 }],
    });
  });

  it("shows how many competencies each may practise here", async () => {
    signedIn([]);

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    const row = (await screen.findByText("dr.lead")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Authorised here")).toBeInTheDocument();
  });

  it("opens the member's page for somebody who may authorise practice", async () => {
    signedIn(["manage_practising_competencies"]);
    const user = userEvent.setup();

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await user.click(await screen.findByText("dr.lead"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1/members/7");
  });

  it("opens the member's page for a teaching admin", async () => {
    signedIn(["manage_teaching"]);
    const user = userEvent.setup();

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await user.click(await screen.findByText("dr.lead"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1/members/7");
  });

  it("lets a teaching admin add and remove staff and edit the site, and not its features", async () => {
    signedIn(["manage_teaching"]);

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await screen.findByText("dr.lead");

    expect(
      screen.getByRole("button", { name: /add staff/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actions for dr.lead" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit site" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit features" }),
    ).not.toBeInTheDocument();
  });

  it("offers Edit site to nobody who holds neither", async () => {
    signedIn(["manage_patient_membership"]);

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await screen.findByText("dr.lead");

    expect(
      screen.queryByRole("button", { name: "Edit site" }),
    ).not.toBeInTheDocument();
  });

  it("offers Edit site to somebody with manage_users", async () => {
    signedIn(["manage_users"]);

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await screen.findByText("dr.lead");

    expect(
      screen.getByRole("button", { name: "Edit site" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add staff/i }),
    ).not.toBeInTheDocument();
  });

  it("opens nothing for anybody else, as before", async () => {
    signedIn([]);
    const user = userEvent.setup();

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await user.click(await screen.findByText("dr.lead"));

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("SiteAdminPage features", () => {
  function signedIn(competencies: string[]) {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: { ...mockAdminUser, competencies } as User,
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    } as ReturnType<typeof authContext.useAuth>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Features are `manage_users`, as on the organisation's page.
    signedIn(["manage_users"]);
  });

  it("draws no features card for a teaching admin", async () => {
    signedIn(["manage_teaching"]);
    vi.spyOn(apiLib.api, "get").mockResolvedValue(site(null));

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });
    await screen.findByText("Site information");

    expect(screen.queryByText("Enabled features")).not.toBeInTheDocument();
  });

  it("shows the features switched on at the site", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...site(null),
      features: ["passport"],
    });

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    expect(await screen.findByText("Enabled features")).toBeInTheDocument();
    expect(screen.getByText("Clinician passport")).toBeInTheDocument();
  });

  it("opens the site's features page from the pencil", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(site(null));

    renderWithRouter(<SiteAdminPage />, { initialRoute: "/admin/sites/1" });

    await user.click(
      await screen.findByRole("button", { name: "Edit features" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1/features");
  });
});
