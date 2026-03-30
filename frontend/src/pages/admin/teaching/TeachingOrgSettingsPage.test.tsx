import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked" }),
  };
});

import { api } from "@/lib/api";
import TeachingOrgSettingsPage from "./TeachingOrgSettingsPage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeachingOrgSettingsPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<TeachingOrgSettingsPage />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });

  it("shows error state on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Server error"));
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeTruthy();
    });
  });

  it("renders form with existing settings", async () => {
    (api.get as Mock).mockResolvedValue({
      id: 1,
      organisation_id: 1,
      coordinator_email: "coord@example.com",
      institution_name: "Test Hospital",
    });
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("coord@example.com")).toBeTruthy();
    });
    expect(screen.getByDisplayValue("Test Hospital")).toBeTruthy();
  });

  it("renders empty form when no settings exist (404)", async () => {
    const err = new Error("Teaching settings not found") as Error & {
      status?: number;
    };
    err.status = 404;
    (api.get as Mock).mockRejectedValue(err);
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Teaching settings")).toBeTruthy();
    });
    expect(screen.getByPlaceholderText("coordinator@example.com")).toBeTruthy();
  });

  it("save button is disabled when form is not dirty", async () => {
    (api.get as Mock).mockResolvedValue({
      id: 1,
      organisation_id: 1,
      coordinator_email: "coord@example.com",
      institution_name: "Test Hospital",
    });
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("coord@example.com")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("save button is enabled when form is dirty", async () => {
    (api.get as Mock).mockResolvedValue({
      id: 1,
      organisation_id: 1,
      coordinator_email: "coord@example.com",
      institution_name: "Test Hospital",
    });
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("coord@example.com")).toBeTruthy();
    });

    const user = userEvent.setup();
    const emailInput = screen.getByDisplayValue("coord@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("shows success message after saving", async () => {
    (api.get as Mock).mockResolvedValue({
      id: 1,
      organisation_id: 1,
      coordinator_email: "coord@example.com",
      institution_name: "Test Hospital",
    });
    (api.put as Mock).mockResolvedValue({});
    renderWithRouter(<TeachingOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("coord@example.com")).toBeTruthy();
    });

    const user = userEvent.setup();
    const emailInput = screen.getByDisplayValue("coord@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Settings updated successfully.")).toBeTruthy();
    });
  });
});
