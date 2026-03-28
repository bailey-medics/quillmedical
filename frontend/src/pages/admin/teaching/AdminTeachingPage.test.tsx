/**
 * Tests for AdminTeachingPage.
 *
 * Verifies rendering of loading, error, empty, and data states,
 * plus sync-all button behaviour.
 */

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

import { api } from "@/lib/api";
import AdminTeachingPage from "./AdminTeachingPage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminTeachingPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AdminTeachingPage />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows empty state when no banks", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("No teaching modules found")).toBeTruthy();
    });
  });

  it("renders page header", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("Teaching modules")).toBeTruthy();
    });
  });

  it("renders sync all button", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });
  });

  it("renders bank data in table", async () => {
    (api.get as Mock).mockResolvedValue([
      {
        bank_id: "chest-xray",
        title: "Chest X-ray interpretation",
        version: 1,
        type: "variable",
        synced_at: "2025-01-15T10:00:00Z",
        in_gcs: true,
        in_db: true,
        item_count: 5,
      },
    ]);
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("Chest X-ray interpretation")).toBeTruthy();
      expect(screen.getByText("variable")).toBeTruthy();
    });
  });

  it("shows error on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Network error"));
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });

  it("calls sync-all on button click", async () => {
    const user = userEvent.setup();

    (api.get as Mock).mockResolvedValue([]);
    (api.post as Mock).mockResolvedValue({
      synced: [],
      errors: [],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/teaching/admin/sync-all", {});
    });
  });

  it("shows success message after sync", async () => {
    const user = userEvent.setup();

    (api.get as Mock).mockResolvedValue([]);
    (api.post as Mock).mockResolvedValue({
      synced: [{ id: 1 }, { id: 2 }],
      errors: [],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(screen.getByText("Successfully synced 2 bank(s)")).toBeTruthy();
    });
  });

  it("shows partial error message after sync with errors", async () => {
    const user = userEvent.setup();

    (api.get as Mock).mockResolvedValue([]);
    (api.post as Mock).mockResolvedValue({
      synced: [{ id: 1 }],
      errors: [{ bank_id: "bad-bank", error: "fail" }],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(screen.getByText("Synced 1 bank(s) with 1 error(s)")).toBeTruthy();
    });
  });
});
