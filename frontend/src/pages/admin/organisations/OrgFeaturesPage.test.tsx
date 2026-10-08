/**
 * OrgFeaturesPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { renderWithMantine, renderWithRouter } from "@/test/test-utils";
import OrgFeaturesPage from "./OrgFeaturesPage";
import * as apiLib from "@/lib/api";

const mockReload = vi.fn().mockResolvedValue(undefined);
// Who is looking at the page. An ordinary administrator unless a test
// makes them an operator, who alone is shown the passport's cover switch.
const viewer = vi.hoisted(() => ({
  platform_role: null as string | null,
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    reload: mockReload,
    state: {
      status: "authenticated",
      user: {
        id: "1",
        username: "admin",
        email: "admin@example.com",
        platform_role: viewer.platform_role,
      },
    },
  }),
}));

describe("OrgFeaturesPage", () => {
  // One request now: an org_unit carries the features switched on there.
  const mockOrg = {
    id: 3,
    name: "Test Hospital",
    type: "hospital_team",
    type_display_name: "Organisation",
    is_root: true,
    parent_id: null,
    location: "",
    is_active: true,
    members: [],
    children: [],
    features: ["teaching"],
    patient_ids: [],
    clinical_lead_id: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    viewer.platform_role = null;
  });

  it("renders page heading after load", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrg);

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Features" }),
      ).toBeInTheDocument();
    });
  });

  it("shows all available features", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
      expect(screen.getByText("Messaging")).toBeInTheDocument();
      expect(screen.getByText("Letters")).toBeInTheDocument();
      expect(screen.getByText("Clinician passport")).toBeInTheDocument();
      expect(screen.getByText("Safety")).toBeInTheDocument();
    });
  });

  it("shows enabled features as checked", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrg);

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const switches = container.querySelectorAll<HTMLInputElement>(
      "input[type='checkbox']",
    );
    expect(switches[0].checked).toBe(true);
    expect(switches[1].checked).toBe(false);
    expect(switches[2].checked).toBe(false);
  });

  it("disables save button when nothing changed", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrg);

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("enables save button after toggling a switch", async () => {
    const user = userEvent.setup();

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);

    expect(screen.getByTestId("submit-button")).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("navigates back to org page when cancel is clicked with no changes", async () => {
    const user = userEvent.setup();

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Should have navigated away - the features page content is gone
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Features" }),
      ).not.toBeInTheDocument();
    });
  });

  it("opens confirmation modal on save", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "put").mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);
    await user.click(screen.getByTestId("submit-button"));

    expect(screen.getByText("Confirm feature changes")).toBeInTheDocument();
    // Modal lists the change
    expect(screen.getAllByText("Teaching").length).toBeGreaterThan(1);
  });

  it("calls PUT API after confirming save", async () => {
    const user = userEvent.setup();
    const putSpy = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(putSpy).toHaveBeenCalledWith("/org-units/3/features/teaching", {
      enabled: true,
    });
  });

  it("toggles the clinician passport against its own key", async () => {
    const user = userEvent.setup();
    const putSpy = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Clinician passport")).toBeInTheDocument();
    });

    // The key sent to the backend is what `requires_feature("passport")`
    // resolves against, so a mismatch here would leave the switch working
    // and every passport route still refusing.
    const switches = container.querySelectorAll<HTMLInputElement>(
      "input[type='checkbox']",
    );
    await user.click(switches[3]);
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(putSpy).toHaveBeenCalledWith("/org-units/3/features/passport", {
      enabled: true,
    });
  });

  it("shows disable warning when disabling features", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "put").mockResolvedValue({ status: "disabled" });

    vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrg);

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);
    await user.click(screen.getByTestId("submit-button"));

    expect(
      screen.getByText(/remove access for everyone they reach here/),
    ).toBeInTheDocument();
  });

  it("does not call API when go back is clicked in modal", async () => {
    const user = userEvent.setup();
    const putSpy = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("button", { name: "Go back" }));

    expect(putSpy).not.toHaveBeenCalled();
    // Draft should still show the toggled state
    expect(teachingSwitch.checked).toBe(true);
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("Server error"));

    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...mockOrg,
      features: [],
    });

    const { container } = renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    const teachingSwitch = container.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    )!;
    await user.click(teachingSwitch);
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows error when data fails to load", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Failed to fetch"));

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  it("shows loading skeleton initially", () => {
    vi.spyOn(apiLib.api, "get").mockImplementation(() => new Promise(() => {}));

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    expect(
      screen.queryByRole("heading", { name: "Features" }),
    ).not.toBeInTheDocument();
  });

  describe("the passport lead frameworks card", () => {
    // The org_unit, and its lead frameworks, answered by URL
    function getWithLeads(features: string[], leads: string[]) {
      return vi
        .spyOn(apiLib.api, "get")
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith("/passport-frameworks")
              ? { framework_ids: leads }
              : { ...mockOrg, features },
          ),
        );
    }

    function pills(container: HTMLElement): string[] {
      return Array.from(container.querySelectorAll(".mantine-Pill-label")).map(
        (pill) => pill.textContent ?? "",
      );
    }

    function renderPage() {
      return renderWithRouter(<OrgFeaturesPage />, {
        routePath: "/admin/organisations/:id/features",
        initialRoute: "/admin/organisations/3/features",
      });
    }

    it("is hidden while the passport is off", async () => {
      getWithLeads(["teaching"], []);
      renderPage();

      await screen.findByRole("heading", { name: "Features" });
      expect(screen.queryByText("Passport frameworks")).not.toBeInTheDocument();
    });

    it("shows the saved leads while the passport is on", async () => {
      const get = getWithLeads(["passport"], ["uk_sact_board_2023"]);
      const { container } = renderPage();

      await screen.findByText("Passport frameworks");
      await waitFor(() =>
        expect(pills(container)).toEqual([
          "Prescriber competencies for reviewing and prescribing SACT (UK SACT Board, November 2023)",
        ]),
      );
      expect(get).toHaveBeenCalledWith("/org-units/3/passport-frameworks");
    });

    it("sits above the save and cancel buttons", async () => {
      getWithLeads(["passport"], ["uk_sact_board_2023"]);
      renderPage();

      const card = await screen.findByText("Passport frameworks");
      const save = screen.getByTestId("submit-button");

      expect(
        card.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("does not submit the feature switches when Enter is pressed in it", async () => {
      // It sits inside the features form now, so a stray Enter must not
      // open the confirmation or save anything
      const user = userEvent.setup();
      getWithLeads(["passport"], ["uk_sact_board_2023"]);
      const put = vi.spyOn(apiLib.api, "put");
      const { container } = renderPage();
      await waitFor(() =>
        expect(pills(container)).toEqual([
          "Prescriber competencies for reviewing and prescribing SACT (UK SACT Board, November 2023)",
        ]),
      );
      // An unsaved switch change, so the form could submit if asked
      await user.click(
        screen.getByRole("switch", { name: "Toggle Messaging" }),
      );

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{Escape}");
      await user.keyboard("{Enter}");

      expect(
        screen.queryByText("Confirm feature changes"),
      ).not.toBeInTheDocument();
      expect(put).not.toHaveBeenCalledWith(
        expect.stringContaining("/features/"),
        expect.anything(),
      );
    });

    it("saves a picked framework straight away, at the end", async () => {
      const user = userEvent.setup();
      getWithLeads(["passport"], ["uk_sact_board_2023"]);
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({
        framework_ids: ["uk_sact_board_2023", "clinical"],
      });
      const { container } = renderPage();
      await waitFor(() =>
        expect(pills(container)).toEqual([
          "Prescriber competencies for reviewing and prescribing SACT (UK SACT Board, November 2023)",
        ]),
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(
        await screen.findByRole("option", {
          name: "General clinical skills (Quill Medical, 2026)",
        }),
      );

      expect(put).toHaveBeenCalledWith("/org-units/3/passport-frameworks", {
        framework_ids: ["uk_sact_board_2023", "clinical"],
      });
    });

    it("puts the leads back, and says so, when a save fails", async () => {
      const user = userEvent.setup();
      getWithLeads(["passport"], ["uk_sact_board_2023"]);
      vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("network"));
      const { container } = renderPage();
      await waitFor(() =>
        expect(pills(container)).toEqual([
          "Prescriber competencies for reviewing and prescribing SACT (UK SACT Board, November 2023)",
        ]),
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(
        await screen.findByRole("option", {
          name: "General clinical skills (Quill Medical, 2026)",
        }),
      );

      expect(
        await screen.findByText(
          "The lead frameworks could not be saved. Please try again.",
        ),
      ).toBeInTheDocument();
      expect(pills(container)).toEqual([
        "Prescriber competencies for reviewing and prescribing SACT (UK SACT Board, November 2023)",
      ]);
    });
  });

  describe("Passport cover", () => {
    const COVER = "Toggle Cover members' writing";

    // The org_unit, its lead frameworks and its cover, answered by URL
    function getWith(features: string[], coveredCount = 0) {
      return vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
        if (url.endsWith("/passport-frameworks")) {
          return Promise.resolve({ framework_ids: [] });
        }
        if (url.endsWith("/passport-cover")) {
          return Promise.resolve({
            enabled: features.includes("passport_write"),
            covered_count: coveredCount,
          });
        }
        return Promise.resolve({ ...mockOrg, features });
      });
    }

    function renderPage() {
      return renderWithRouter(<OrgFeaturesPage />, {
        routePath: "/admin/organisations/:id/features",
        initialRoute: "/admin/organisations/3/features",
      });
    }

    it("is not shown to somebody who is not an operator", async () => {
      getWith(["passport"]);
      renderPage();

      await screen.findByRole("switch", { name: "Toggle Clinician passport" });
      expect(
        screen.queryByRole("switch", { name: COVER }),
      ).not.toBeInTheDocument();
    });

    it("is hidden from an operator while the passport is off", async () => {
      viewer.platform_role = "superadmin";
      getWith(["teaching"]);
      renderPage();

      await screen.findByRole("switch", { name: "Toggle Clinician passport" });
      expect(
        screen.queryByRole("switch", { name: COVER }),
      ).not.toBeInTheDocument();
    });

    it("appears when the operator turns the passport on", async () => {
      const user = userEvent.setup();
      viewer.platform_role = "superadmin";
      getWith([]);
      renderPage();

      await user.click(
        await screen.findByRole("switch", {
          name: "Toggle Clinician passport",
        }),
      );

      expect(screen.getByRole("switch", { name: COVER })).not.toBeChecked();
    });

    it("shows as on where the cover is already switched on", async () => {
      viewer.platform_role = "superadmin";
      getWith(["passport", "passport_write"], 4);
      renderPage();

      expect(await screen.findByRole("switch", { name: COVER })).toBeChecked();
    });

    it("sends the passport before the cover when both are switched on", async () => {
      const user = userEvent.setup();
      viewer.platform_role = "superadmin";
      getWith([]);
      const put = vi
        .spyOn(apiLib.api, "put")
        .mockResolvedValue({ status: "enabled" });
      renderPage();

      await user.click(
        await screen.findByRole("switch", {
          name: "Toggle Clinician passport",
        }),
      );
      await user.click(screen.getByRole("switch", { name: COVER }));
      await user.click(screen.getByTestId("submit-button"));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
      expect(put.mock.calls.map((call) => call[0])).toEqual([
        "/org-units/3/features/passport",
        "/org-units/3/features/passport_write",
      ]);
    });

    it("says how many people lose writing when it is switched off", async () => {
      const user = userEvent.setup();
      viewer.platform_role = "superadmin";
      getWith(["passport", "passport_write"], 4);
      renderPage();

      await user.click(await screen.findByRole("switch", { name: COVER }));
      await user.click(screen.getByTestId("submit-button"));

      expect(
        screen.getByText(
          /4 people will no longer be able to add to their passport/,
        ),
      ).toBeInTheDocument();
    });

    it("goes off with the passport, and only the passport is sent", async () => {
      const user = userEvent.setup();
      viewer.platform_role = "superadmin";
      getWith(["passport", "passport_write"], 1);
      const put = vi
        .spyOn(apiLib.api, "put")
        .mockResolvedValue({ status: "disabled" });
      renderPage();

      await screen.findByRole("switch", { name: COVER });
      await user.click(
        screen.getByRole("switch", { name: "Toggle Clinician passport" }),
      );

      // The cover switch goes with the passport one
      expect(
        screen.queryByRole("switch", { name: COVER }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("submit-button"));
      expect(
        screen.getByText(
          /1 person will no longer be able to add to their passport/,
        ),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(put).toHaveBeenCalledWith("/org-units/3/features/passport", {
        enabled: false,
      });
    });
  });

  describe("Teaching on a site", () => {
    const site = {
      ...mockOrg,
      name: "Cheltenham oncology",
      type: "site",
      is_root: false,
      parent_id: 1,
    };

    function renderSitePage() {
      renderWithRouter(<OrgFeaturesPage parentPath="sites" />, {
        routePath: "/admin/sites/:id/features",
        initialRoute: "/admin/sites/3/features",
      });
    }

    it("is not offered, since it is switched on for an organisation", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...site, features: [] });

      renderSitePage();

      expect(await screen.findByText("Clinician passport")).toBeInTheDocument();
      expect(screen.queryByText("Teaching")).not.toBeInTheDocument();
    });

    it("is still shown where it is already on, so it can be switched off", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...site,
        features: ["teaching"],
      });
      const put = vi
        .spyOn(apiLib.api, "put")
        .mockResolvedValue({ status: "disabled" });

      renderSitePage();

      await user.click(
        await screen.findByRole("switch", { name: "Toggle Teaching" }),
      );
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await user.click(await screen.findByRole("button", { name: "Confirm" }));

      await waitFor(() =>
        expect(put).toHaveBeenCalledWith("/org-units/3/features/teaching", {
          enabled: false,
        }),
      );
    });

    it("leaves the other switches saving as before", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ ...site, features: [] });
      const put = vi
        .spyOn(apiLib.api, "put")
        .mockResolvedValue({ status: "enabled" });

      renderSitePage();

      await user.click(
        await screen.findByRole("switch", { name: "Toggle Messaging" }),
      );
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await user.click(await screen.findByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(put).toHaveBeenCalledWith("/org-units/3/features/messaging", {
        enabled: true,
      });
    });
  });

  describe("On a site", () => {
    it("goes back to the site on cancel", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockOrg,
        name: "Cheltenham oncology",
        type: "site",
        is_root: false,
        parent_id: 1,
        features: ["passport"],
      });
      const router = createMemoryRouter(
        [
          {
            path: "/admin/sites/:id/features",
            element: <OrgFeaturesPage parentPath="sites" />,
          },
          { path: "/admin/sites/:id", element: <p>The site page</p> },
        ],
        { initialEntries: ["/admin/sites/3/features"] },
      );

      renderWithMantine(<RouterProvider router={router} />);

      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(await screen.findByText("The site page")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/admin/sites/3");
    });
  });
});
