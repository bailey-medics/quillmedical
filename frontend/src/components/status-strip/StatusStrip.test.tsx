import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import StatusStrip from "./StatusStrip";

function mockMediaQuery(matches: boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("max-width") ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

describe("StatusStrip Component", () => {
  afterEach(() => {
    mockMediaQuery(false);
  });

  describe("Desktop rendering", () => {
    it("renders the offline message with timestamp", () => {
      mockMediaQuery(false);
      renderWithMantine(
        <StatusStrip variant="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByText(/Offline — last synced at/)).toBeInTheDocument();
    });

    it("renders the offline message without a timestamp", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="offline" />);
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    it("renders the reconnected message", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="reconnected" />);
      expect(screen.getByText("Reconnected")).toBeInTheDocument();
    });

    it("renders the updating message", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="updating" />);
      expect(
        screen.getByText("Updating to the latest version…"),
      ).toBeInTheDocument();
    });

    it("renders the fallback message", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="fallback" />);
      expect(
        screen.getByText(
          /update is available but couldn't be applied automatically/i,
        ),
      ).toBeInTheDocument();
    });

    it("does not render a badge label on desktop", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="fallback" />);
      expect(screen.queryByText("Update pending")).not.toBeInTheDocument();
    });
  });

  describe("Mobile rendering (badge)", () => {
    it("stays a full strip on mobile when only one strip is showing", () => {
      mockMediaQuery(true);
      renderWithMantine(
        <StatusStrip variant="offline" lastSyncedAt={new Date()} />,
      );
      expect(screen.getByText(/Offline — last synced at/)).toBeInTheDocument();
    });

    it("renders a compact badge label when multiple strips are showing", () => {
      mockMediaQuery(true);
      renderWithMantine(
        <StatusStrip variant="offline" lastSyncedAt={new Date()} multiple />,
      );
      expect(screen.getByText("Offline")).toBeInTheDocument();
      expect(screen.queryByText(/last synced at/)).not.toBeInTheDocument();
    });

    it("renders the fallback badge label when multiple strips are showing", () => {
      mockMediaQuery(true);
      renderWithMantine(<StatusStrip variant="fallback" multiple />);
      expect(screen.getByText("Update pending")).toBeInTheDocument();
    });

    it("renders the updating badge label when multiple strips are showing", () => {
      mockMediaQuery(true);
      renderWithMantine(<StatusStrip variant="updating" multiple />);
      expect(screen.getByText("Updating")).toBeInTheDocument();
    });

    it("stays a full strip on desktop even when multiple is set", () => {
      mockMediaQuery(false);
      renderWithMantine(<StatusStrip variant="updating" multiple />);
      expect(
        screen.getByText("Updating to the latest version…"),
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has role status", () => {
      renderWithMantine(<StatusStrip variant="offline" />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-live polite", () => {
      renderWithMantine(<StatusStrip variant="offline" />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Non-dismissible", () => {
    it("renders no button or dismiss/close control for any variant", () => {
      (["offline", "reconnected", "updating", "fallback"] as const).forEach(
        (variant) => {
          const { unmount } = renderWithMantine(
            <StatusStrip variant={variant} />,
          );
          expect(screen.queryByRole("button")).not.toBeInTheDocument();
          unmount();
        },
      );
    });
  });
});
