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
  const mockOrg = { id: 3, name: "Test Hospital" };
  const mockFeatures = {
    features: [
      {
        feature_key: "teaching",
        enabled_at: "2026-01-15T10:00:00Z",
        enabled_by: 1,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page heading after load", async () => {
    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve(mockFeatures);
      return Promise.resolve(mockOrg);
    });

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
    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
    });

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
      expect(screen.getByText("Messaging")).toBeInTheDocument();
      expect(screen.getByText("Letters")).toBeInTheDocument();
    });
  });

  it("shows enabled features as checked", async () => {
    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve(mockFeatures);
      return Promise.resolve(mockOrg);
    });

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
    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve(mockFeatures);
      return Promise.resolve(mockOrg);
    });

    renderWithRouter(<OrgFeaturesPage />, {
      routePath: "/admin/organisations/:id/features",
      initialRoute: "/admin/organisations/3/features",
    });

    await waitFor(() => {
      expect(screen.getByText("Teaching")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("enables save button after toggling a switch", async () => {
    const user = userEvent.setup();

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("navigates back to org page when cancel is clicked with no changes", async () => {
    const user = userEvent.setup();

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Confirm feature changes")).toBeInTheDocument();
    // Modal lists the change
    expect(screen.getAllByText("Teaching").length).toBeGreaterThan(1);
  });

  it("calls PUT API after confirming save", async () => {
    const user = userEvent.setup();
    const putSpy = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(putSpy).toHaveBeenCalledWith("/organizations/3/features/teaching", {
      enabled: true,
    });
  });

  it("shows disable warning when disabling features", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "put").mockResolvedValue({ status: "disabled" });

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve(mockFeatures);
      return Promise.resolve(mockOrg);
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText(/remove access for all users/)).toBeInTheDocument();
  });

  it("does not call API when go back is clicked in modal", async () => {
    const user = userEvent.setup();
    const putSpy = vi
      .spyOn(apiLib.api, "put")
      .mockResolvedValue({ status: "enabled" });

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(screen.getByRole("button", { name: "Go back" }));

    expect(putSpy).not.toHaveBeenCalled();
    // Draft should still show the toggled state
    expect(teachingSwitch.checked).toBe(true);
  });

  it("reverts draft on API failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "put").mockRejectedValue(new Error("Server error"));

    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve({ features: [] });
      return Promise.resolve(mockOrg);
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(teachingSwitch.checked).toBe(false);
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
});
