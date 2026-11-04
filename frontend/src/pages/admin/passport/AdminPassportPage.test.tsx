/**
 * AdminPassportPage Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as passportApi from "@lib/passport/api";
import type { FrameworkSyncStatus } from "@lib/passport";
import AdminPassportPage, { POLL_MILLISECONDS } from "./AdminPassportPage";

vi.mock("@lib/passport/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/passport/api")>()),
  fetchFrameworkSync: vi.fn<typeof passportApi.fetchFrameworkSync>(),
  startFrameworkSync: vi.fn<typeof passportApi.startFrameworkSync>(),
}));

const fetchSync = vi.mocked(passportApi.fetchFrameworkSync);
const startSync = vi.mocked(passportApi.startFrameworkSync);

const earlier: FrameworkSyncStatus = {
  configured: true,
  last_run: {
    started_at: "2026-11-04T09:00:00Z",
    finished_at: "2026-11-04T09:01:00Z",
    status: "succeeded",
    versions_written: 4,
    error: null,
  },
};

describe("AdminPassportPage", () => {
  beforeEach(() => {
    fetchSync.mockReset();
    startSync.mockReset();
    fetchSync.mockResolvedValue(earlier);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows how the last run ended", async () => {
    renderWithRouter(<AdminPassportPage />);

    expect(
      await screen.findByText("It stored 4 new framework versions."),
    ).toBeInTheDocument();
  });

  it("starts the sync and says so", async () => {
    startSync.mockResolvedValue({ execution: "an-execution" });
    renderWithRouter(<AdminPassportPage />);
    await screen.findByText("It stored 4 new framework versions.");

    await userEvent.click(
      screen.getByRole("button", { name: /sync frameworks/i }),
    );

    expect(startSync).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("The framework sync has started"),
    ).toBeInTheDocument();
  });

  it("shows the server's refusal where no job is set up", async () => {
    startSync.mockRejectedValue(
      new Error("The framework sync is not set up here."),
    );
    renderWithRouter(<AdminPassportPage />);
    await screen.findByText("It stored 4 new framework versions.");

    await userEvent.click(
      screen.getByRole("button", { name: /sync frameworks/i }),
    );

    expect(
      await screen.findByText("The framework sync is not set up here."),
    ).toBeInTheDocument();
    expect(screen.queryByText("The framework sync has started")).toBeNull();
  });

  it("shows the new run once it has finished", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    startSync.mockResolvedValue({ execution: "an-execution" });
    renderWithRouter(<AdminPassportPage />);
    await screen.findByText("It stored 4 new framework versions.");

    await userEvent.click(
      screen.getByRole("button", { name: /sync frameworks/i }),
    );
    await screen.findByText("The framework sync has started");

    fetchSync.mockResolvedValue({
      configured: true,
      last_run: {
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: "succeeded",
        versions_written: 0,
        error: null,
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
    });

    await waitFor(() =>
      expect(
        screen.getByText("Every framework was up to date."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("The framework sync has started")).toBeNull();
  });

  it("says so when the status cannot be loaded", async () => {
    fetchSync.mockRejectedValue(new Error("down"));
    renderWithRouter(<AdminPassportPage />);

    expect(
      await screen.findByText(
        "The framework sync could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});
