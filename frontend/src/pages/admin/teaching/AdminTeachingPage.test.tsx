/**
 * Tests for AdminTeachingPage.
 *
 * Verifies rendering of bank data, sync-all button behaviour,
 * and post-sync result display via SyncResultsPanel.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

function bank(bank_id: string, title: string) {
  return {
    bank_id,
    title,
    version: 1,
    type: "uniform",
    synced_at: null,
    in_gcs: true,
    in_db: true,
    item_count: 10,
  };
}

function syncedRecord(question_bank_id: string) {
  return {
    id: 1,
    question_bank_id,
    version: 1,
    status: "success",
    items_created: 10,
    items_updated: 0,
    errors: [],
    warnings: [],
    started_at: "2026-05-28T10:00:00Z",
    completed_at: "2026-05-28T10:00:05Z",
    unchanged: false,
  };
}

async function syncAll() {
  const user = userEvent.setup();

  renderWithRouter(<AdminTeachingPage />);

  await waitFor(() => {
    expect(screen.getByText("Sync all")).toBeTruthy();
  });

  await user.click(screen.getByText("Sync all"));

  await waitFor(() => {
    expect(screen.getByText("Status")).toBeTruthy();
  });
}

describe("AdminTeachingPage", () => {
  it("says so when the banks cannot be loaded", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Service unavailable"));

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Could not load the question banks"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Service unavailable")).toBeInTheDocument();
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

  it("shows errors for banks not yet in the database", async () => {
    const user = userEvent.setup();

    // No banks in DB initially
    (api.get as Mock).mockResolvedValue([]);
    (api.post as Mock).mockResolvedValue({
      synced: [],
      errors: [{ bank_id: "new-module", error: "module directory not found" }],
    });

    renderWithRouter(<AdminTeachingPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync all")).toBeTruthy();
    });

    await user.click(screen.getByText("Sync all"));

    await waitFor(() => {
      expect(screen.getByText("Sync failed")).toBeTruthy();
      expect(screen.getByText("module directory not found")).toBeTruthy();
    });
  });

  it("shows a bank that did not load as failed, with the reason, and not as imported", async () => {
    (api.get as Mock).mockResolvedValue([bank("mod-a", "Module A")]);
    (api.post as Mock).mockResolvedValue({
      synced: [],
      errors: [{ bank_id: "mod-a", error: "uniform type requires 'options'" }],
    });

    await syncAll();

    expect(screen.getByText("Sync fail")).toBeTruthy();
    expect(screen.getByText("uniform type requires 'options'")).toBeTruthy();
    expect(screen.queryByText("Sync pass")).toBeNull();
    expect(screen.queryByText("Up to date")).toBeNull();
    expect(screen.getByText("Sync failed")).toBeTruthy();
  });

  it("shows each bank's own fate when one synced and one did not load", async () => {
    (api.get as Mock).mockResolvedValue([
      bank("mod-a", "Module A"),
      bank("mod-b", "Module B"),
    ]);
    (api.post as Mock).mockResolvedValue({
      synced: [syncedRecord("mod-a")],
      errors: [{ bank_id: "mod-b", error: "no questions found" }],
    });

    await syncAll();

    const passed = screen.getByText("Module A").closest("tr");
    const failed = screen.getByText("Module B").closest("tr");

    expect(within(passed as HTMLElement).getByText("Sync pass")).toBeTruthy();
    expect(within(failed as HTMLElement).getByText("Sync fail")).toBeTruthy();
    expect(screen.getAllByText("Sync pass")).toHaveLength(1);
    expect(screen.getAllByText("Sync fail")).toHaveLength(1);
    expect(screen.getByText("no questions found")).toBeTruthy();
    expect(screen.getByText("Sync complete with errors")).toBeTruthy();
  });

  it("shows a result with only synced banks as imported, with nothing failed", async () => {
    (api.get as Mock).mockResolvedValue([bank("mod-a", "Module A")]);
    (api.post as Mock).mockResolvedValue({
      synced: [syncedRecord("mod-a")],
      errors: [],
    });

    await syncAll();

    expect(screen.getByText("Sync pass")).toBeTruthy();
    expect(screen.queryByText("Sync fail")).toBeNull();
    expect(screen.getByText("Sync complete")).toBeTruthy();
  });

  it("shows a bank with nothing to do as up to date, not as an error", async () => {
    (api.get as Mock).mockResolvedValue([bank("mod-a", "Module A")]);
    (api.post as Mock).mockResolvedValue({ synced: [], errors: [] });

    await syncAll();

    expect(screen.getByText("Up to date")).toBeTruthy();
    expect(screen.queryByText("Sync fail")).toBeNull();
    expect(screen.getByText("Sync complete")).toBeTruthy();
  });
});
