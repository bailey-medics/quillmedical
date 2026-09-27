/**
 * OrgFeaturesPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import OrgFeaturesPage from "./OrgFeaturesPage";
import * as apiLib from "@/lib/api";

const mockReload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ reload: mockReload }),
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

    // Should have navigated away — the features page content is gone
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

    expect(screen.getByText(/remove access for all users/)).toBeInTheDocument();
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

  describe("the passport lead specialties card", () => {
    // The org_unit, and its lead specialties, answered by URL
    function getWithLeads(features: string[], leads: string[]) {
      return vi
        .spyOn(apiLib.api, "get")
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith("/passport-specialties")
              ? { specialty_ids: leads }
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
      expect(
        screen.queryByText("Passport specialties"),
      ).not.toBeInTheDocument();
    });

    it("shows the saved leads while the passport is on", async () => {
      const get = getWithLeads(["passport"], ["oncology"]);
      const { container } = renderPage();

      await screen.findByText("Passport specialties");
      await waitFor(() => expect(pills(container)).toEqual(["Oncology"]));
      expect(get).toHaveBeenCalledWith("/org-units/3/passport-specialties");
    });

    it("sits above the save and cancel buttons", async () => {
      getWithLeads(["passport"], ["oncology"]);
      renderPage();

      const card = await screen.findByText("Passport specialties");
      const save = screen.getByTestId("submit-button");

      expect(
        card.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("does not submit the feature switches when Enter is pressed in it", async () => {
      // It sits inside the features form now, so a stray Enter must not
      // open the confirmation or save anything
      const user = userEvent.setup();
      getWithLeads(["passport"], ["oncology"]);
      const put = vi.spyOn(apiLib.api, "put");
      const { container } = renderPage();
      await waitFor(() => expect(pills(container)).toEqual(["Oncology"]));
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

    it("saves a picked specialty straight away, at the end", async () => {
      const user = userEvent.setup();
      getWithLeads(["passport"], ["oncology"]);
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({
        specialty_ids: ["oncology", "general_surgery"],
      });
      const { container } = renderPage();
      await waitFor(() => expect(pills(container)).toEqual(["Oncology"]));

      await user.click(screen.getByRole("combobox"));
      await user.click(
        await screen.findByRole("option", { name: "General surgery" }),
      );

      expect(put).toHaveBeenCalledWith("/org-units/3/passport-specialties", {
        specialty_ids: ["oncology", "general_surgery"],
      });
    });

    it("puts the leads back, and says so, when a save fails", async () => {
      const user = userEvent.setup();
      getWithLeads(["passport"], ["oncology"]);
      vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("network"));
      const { container } = renderPage();
      await waitFor(() => expect(pills(container)).toEqual(["Oncology"]));

      await user.click(screen.getByRole("combobox"));
      await user.click(
        await screen.findByRole("option", { name: "General surgery" }),
      );

      expect(
        await screen.findByText(
          "The lead specialties could not be saved. Please try again.",
        ),
      ).toBeInTheDocument();
      expect(pills(container)).toEqual(["Oncology"]);
    });
  });
});
