import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import UpdateFallbackBanner from "./UpdateFallbackBanner";

describe("UpdateFallbackBanner Component", () => {
  it("renders the fallback message", () => {
    renderWithMantine(<UpdateFallbackBanner onDismiss={vi.fn()} />);
    expect(
      screen.getByText(
        /update is available but couldn't be applied automatically/i,
      ),
    ).toBeInTheDocument();
  });

  describe("Accessibility", () => {
    it("has role status", () => {
      renderWithMantine(<UpdateFallbackBanner onDismiss={vi.fn()} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-live polite", () => {
      renderWithMantine(<UpdateFallbackBanner onDismiss={vi.fn()} />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Interactions", () => {
    it("calls onDismiss when Dismiss is clicked", () => {
      const onDismiss = vi.fn();
      renderWithMantine(<UpdateFallbackBanner onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("renders a manual refresh action", () => {
      renderWithMantine(<UpdateFallbackBanner onDismiss={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: /refresh now/i }),
      ).toBeInTheDocument();
    });
  });
});
