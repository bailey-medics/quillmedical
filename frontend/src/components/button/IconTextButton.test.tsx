/**
 * IconTextButton Component Tests
 *
 * Tests for the IconTextButton component covering:
 * - Rendering with label and icon
 * - Click interactions
 * - Disabled state
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import IconTextButton from "./IconTextButton";

describe("IconTextButton", () => {
  describe("Rendering", () => {
    it("renders with label text", () => {
      renderWithMantine(<IconTextButton icon="refresh" label="Sync all" />);
      expect(
        screen.getByRole("button", { name: /sync all/i }),
      ).toBeInTheDocument();
    });

    it("renders icon", () => {
      renderWithMantine(<IconTextButton icon="refresh" label="Sync all" />);
      const button = screen.getByRole("button");
      const svg = button.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(
        <IconTextButton
          icon="refresh"
          label="Sync all"
          onClick={handleClick}
        />,
      );

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(
        <IconTextButton
          icon="refresh"
          label="Sync all"
          onClick={handleClick}
          disabled
        />,
      );

      await user.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("States", () => {
    it("shows disabled state", () => {
      renderWithMantine(
        <IconTextButton icon="refresh" label="Sync all" disabled />,
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is interactive when not disabled", () => {
      renderWithMantine(<IconTextButton icon="refresh" label="Sync all" />);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  describe("Labels", () => {
    it("renders different label variations", () => {
      const { rerender } = renderWithMantine(
        <IconTextButton icon="refresh" label="Sync all" />,
      );
      expect(screen.getByText("Sync all")).toBeInTheDocument();

      rerender(<IconTextButton icon="refresh" label="Refresh data" />);
      expect(screen.getByText("Refresh data")).toBeInTheDocument();
    });
  });
});
