/**
 * SyncResultsPanel Component Tests
 */
import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import SyncResultsPanel from "./SyncResultsPanel";
import { getSyncSummary } from "./getSyncSummary";
import type { SyncModuleRow } from "./SyncResultsPanel";

const imported: SyncModuleRow = {
  bank_id: "eoeeta-basic",
  title: "EoE/ETA basic assessment",
  type: "uniform",
  outcome: "imported",
  version: 2,
  item_count: 48,
  reason: "",
};

const skipped: SyncModuleRow = {
  bank_id: "eoeeta-advanced",
  title: "EoE/ETA advanced assessment",
  type: "uniform",
  outcome: "skipped",
  version: 2,
  item_count: 32,
  reason: "Version 2 is not greater than stored version 2",
};

const errored: SyncModuleRow = {
  bank_id: "respiratory-basics",
  title: "Respiratory basics",
  type: "variable",
  outcome: "error",
  version: 3,
  item_count: 60,
  reason: "Failed to download from GCS: timeout after 30s",
};

describe("SyncResultsPanel", () => {
  it("getSyncSummary returns success when all modules imported", () => {
    const summary = getSyncSummary([imported]);
    expect(summary.variant).toBe("success");
    expect(summary.title).toBe("Sync complete");
    expect(summary.description).toBe("1 module imported successfully");
  });

  it("getSyncSummary returns partial_success when mixed outcomes", () => {
    const summary = getSyncSummary([imported, skipped, errored]);
    expect(summary.variant).toBe("partial_success");
    expect(summary.title).toBe("Sync complete with errors");
    expect(summary.description).toBe("1 imported, 2 errors");
  });

  it("getSyncSummary returns error when all fail", () => {
    const summary = getSyncSummary([skipped, errored]);
    expect(summary.variant).toBe("error");
    expect(summary.title).toBe("Sync failed");
    expect(summary.description).toBe("2 errors");
  });

  it("hides summary before sync", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.queryByText("Sync complete")).not.toBeInTheDocument();
  });

  it("shows 'Last synced' column header before sync", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.getByText("Last synced")).toBeInTheDocument();
  });

  it("shows 'Status' column header after sync", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} hasSynced />);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders module titles in the table", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported, skipped]} />);
    expect(screen.getByText("EoE/ETA basic assessment")).toBeInTheDocument();
    expect(screen.getByText("EoE/ETA advanced assessment")).toBeInTheDocument();
  });

  it("shows 'Sync pass' for imported modules", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} hasSynced />);
    expect(screen.getByText("Sync pass")).toBeInTheDocument();
  });

  it("shows 'Sync fail' for skipped modules with reason in sub-row", () => {
    renderWithMantine(<SyncResultsPanel modules={[skipped]} hasSynced />);
    expect(screen.getByText("Sync fail")).toBeInTheDocument();
    expect(
      screen.getByText("Version 2 is not greater than stored version 2"),
    ).toBeInTheDocument();
  });

  it("renders PageHeader with correct title", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.getByText("Teaching modules")).toBeInTheDocument();
  });

  it("renders Sync all button", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.getByText("Sync all")).toBeInTheDocument();
  });

  it("renders type column", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.getByText("uniform")).toBeInTheDocument();
  });

  it("renders item count column", () => {
    renderWithMantine(<SyncResultsPanel modules={[imported]} />);
    expect(screen.getByText("48")).toBeInTheDocument();
  });
});
