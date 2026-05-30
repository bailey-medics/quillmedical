/**
 * Tests for AdminTeachingPage.
 *
 * Verifies rendering of bank data, sync-all button behaviour,
 * and post-sync result display via SyncResultsPanel.
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

  it("shows 'Last synced' column before sync", async () => {
    (api.get as Mock).mockResolvedValue([
      {
        bank_id: "mod-a",
        title: "Module A",
        version: 1,
        type: "uniform",
        synced_at: null,
        in_gcs: true,
        in_db: true,
        item_count: 10,
      },
    ]);
    renderWithRouter(<AdminTeachingPage />);
    await waitFor(() => {
      expect(screen.getByText("Last synced")).toBeTruthy();
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

  it("shows success summary after sync with no errors", async () => {
    const user = userEvent.setup();

    (api.get as Mock).mockResolvedValue([
      {
        bank_id: "mod-a",
        title: "Module A",
        version: 1,
        type: "uniform",
        synced_at: null,
        in_gcs: true,
        in_db: true,
        item_count: 10,
      },
    ]);
    (api.post as Mock).mockResolvedValue({
      synced: [
        {
          id: 1,
          question_bank_id: "mod-a",
          version: 1,
          status: "completed",
          items_created: 10,
          items_updated: 0,
          errors: [],
          warnings: [],
          started_at: "2026-05-28T10:00:00Z",
          completed_at: "2026-05-28T10:00:05Z",
        },
      ],
      errors: [],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(screen.getByText("Sync complete")).toBeTruthy();
      expect(screen.getByText("Status")).toBeTruthy();
    });
  });

  it("shows error summary after sync with errors", async () => {
    const user = userEvent.setup();

    (api.get as Mock).mockResolvedValue([
      {
        bank_id: "mod-a",
        title: "Module A",
        version: 1,
        type: "uniform",
        synced_at: null,
        in_gcs: true,
        in_db: true,
        item_count: 10,
      },
    ]);
    (api.post as Mock).mockResolvedValue({
      synced: [],
      errors: [{ bank_id: "mod-a", error: "Download failed" }],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(screen.getByText("Sync failed")).toBeTruthy();
      expect(screen.getByText("Download failed")).toBeTruthy();
    });
  });
});
