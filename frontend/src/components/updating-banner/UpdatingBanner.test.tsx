import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import UpdatingBanner from "./UpdatingBanner";

describe("UpdatingBanner Component", () => {
  it("renders the updating message", () => {
    renderWithMantine(<UpdatingBanner />);
    expect(
      screen.getByText("Updating to the latest version…"),
    ).toBeInTheDocument();
  });

  describe("Accessibility", () => {
    it("has role status", () => {
      renderWithMantine(<UpdatingBanner />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-live polite", () => {
      renderWithMantine(<UpdatingBanner />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Non-dismissible", () => {
    it("renders no button or dismiss/close control", () => {
      renderWithMantine(<UpdatingBanner />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
