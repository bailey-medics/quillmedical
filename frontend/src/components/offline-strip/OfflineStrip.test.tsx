import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import OfflineStrip from "./OfflineStrip";

describe("OfflineStrip Component", () => {
  describe("Offline state", () => {
    it("renders the offline message with timestamp", () => {
      renderWithMantine(
        <OfflineStrip state="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByText(/Offline — last synced at/)).toBeInTheDocument();
    });

    it("does not render reconnected message", () => {
      renderWithMantine(
        <OfflineStrip state="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.queryByText("Reconnected")).not.toBeInTheDocument();
    });
  });

  describe("Reconnected state", () => {
    it("renders the reconnected message", () => {
      renderWithMantine(
        <OfflineStrip state="reconnected" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByText("Reconnected")).toBeInTheDocument();
    });

    it("does not show last synced text", () => {
      renderWithMantine(
        <OfflineStrip state="reconnected" lastSyncedAt={new Date()} />,
      );
      expect(screen.queryByText(/last synced at/)).not.toBeInTheDocument();
    });

    it("does not render offline message", () => {
      renderWithMantine(
        <OfflineStrip state="reconnected" lastSyncedAt={new Date()} />,
      );
      expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has role status", () => {
      renderWithMantine(
        <OfflineStrip state="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-live polite", () => {
      renderWithMantine(
        <OfflineStrip state="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    });
  });
});
