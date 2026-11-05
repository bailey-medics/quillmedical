/**
 * FrameworkSyncPanel Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import FrameworkSyncPanel from "./FrameworkSyncPanel";
import type { FrameworkSyncStatus } from "@lib/passport";

const ran = (
  overrides: Partial<NonNullable<FrameworkSyncStatus["last_run"]>> = {},
): FrameworkSyncStatus => ({
  configured: true,
  last_run: {
    started_at: "2026-11-04T15:20:00Z",
    finished_at: "2026-11-04T15:21:30Z",
    status: "succeeded",
    versions_written: 2,
    error: null,
    ...overrides,
  },
});

describe("FrameworkSyncPanel", () => {
  it("names the page and offers the one button", () => {
    renderWithMantine(<FrameworkSyncPanel status={ran()} onSync={vi.fn()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Passport" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sync frameworks/i }),
    ).toBeEnabled();
  });

  it("starts the sync when the button is pressed", async () => {
    const onSync = vi.fn();
    renderWithMantine(<FrameworkSyncPanel status={ran()} onSync={onSync} />);

    await userEvent.click(
      screen.getByRole("button", { name: /sync frameworks/i }),
    );

    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("says how many versions the last run stored", () => {
    renderWithMantine(<FrameworkSyncPanel status={ran()} onSync={vi.fn()} />);

    expect(
      screen.getByText("It stored 2 new framework versions."),
    ).toBeInTheDocument();
  });

  it("says one version in the singular", () => {
    renderWithMantine(
      <FrameworkSyncPanel
        status={ran({ versions_written: 1 })}
        onSync={vi.fn()}
      />,
    );

    expect(
      screen.getByText("It stored 1 new framework version."),
    ).toBeInTheDocument();
  });

  it("says when nothing was new", () => {
    renderWithMantine(
      <FrameworkSyncPanel
        status={ran({ versions_written: 0 })}
        onSync={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Every framework was up to date."),
    ).toBeInTheDocument();
  });

  it("says a failed run stored nothing, and why", () => {
    renderWithMantine(
      <FrameworkSyncPanel
        status={ran({
          status: "failed",
          versions_written: 0,
          error: "Framework 'clinical' skipped version 2.",
        })}
        onSync={vi.fn()}
      />,
    );

    expect(
      screen.getByText("It failed, and nothing was stored."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Framework 'clinical' skipped version 2."),
    ).toBeInTheDocument();
  });

  it("says so when the frameworks have never been synced", () => {
    renderWithMantine(
      <FrameworkSyncPanel
        status={{ configured: true, last_run: null }}
        onSync={vi.fn()}
      />,
    );

    expect(
      screen.getByText("The frameworks have not been synced yet."),
    ).toBeInTheDocument();
  });

  it("says the sync has started once it has", () => {
    renderWithMantine(
      <FrameworkSyncPanel status={ran()} started onSync={vi.fn()} />,
    );

    expect(
      screen.getByText("The framework sync has started"),
    ).toBeInTheDocument();
  });

  it("shows a refusal in the server's words", () => {
    renderWithMantine(
      <FrameworkSyncPanel
        status={{ configured: false, last_run: null }}
        refusal="The framework sync is not set up here."
        onSync={vi.fn()}
      />,
    );

    expect(
      screen.getByText("The framework sync is not set up here."),
    ).toBeInTheDocument();
  });

  it("does not offer the button twice while a start is on its way", () => {
    renderWithMantine(
      <FrameworkSyncPanel status={ran()} starting onSync={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: /sync frameworks/i }),
    ).toBeDisabled();
  });

  it("shows no run while loading", () => {
    renderWithMantine(
      <FrameworkSyncPanel status={null} loading onSync={vi.fn()} />,
    );

    expect(screen.queryByText(/stored|up to date|synced yet/)).toBeNull();
  });
});
