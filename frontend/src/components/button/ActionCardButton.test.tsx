/**
 * ActionCardButton Component Tests
 *
 * Tests for the ActionCardButton component covering:
 * - Rendering with label
 * - Link vs onClick behaviour
 * - Disabled state
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, renderWithRouter } from "@test/test-utils";
import ActionCardButton from "./ActionCardButton";

describe("ActionCardButton", () => {
  describe("Rendering", () => {
    it("renders with label text", () => {
      renderWithRouter(<ActionCardButton label="View details" />);
      expect(
        screen.getByRole("link", { name: /view details/i }),
      ).toBeInTheDocument();
    });

    it("renders as a link when url is provided", () => {
      renderWithRouter(
        <ActionCardButton label="View details" url="/patients/123" />,
      );
      const link = screen.getByRole("link", { name: /view details/i });
      expect(link).toHaveAttribute("href", "/patients/123");
    });

    it("renders as a button when onClick is provided", () => {
      const handleClick = vi.fn();
      renderWithMantine(
        <ActionCardButton label="Create record" onClick={handleClick} />,
      );
      expect(
        screen.getByRole("button", { name: /create record/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(
        <ActionCardButton label="Create record" onClick={handleClick} />,
      );

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(
        <ActionCardButton
          label="Create record"
          onClick={handleClick}
          disabled
        />,
      );

      const button = screen.getByRole("button");
      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("States", () => {
    it("renders disabled link", () => {
      renderWithRouter(
        <ActionCardButton label="View details" url="/example" disabled />,
      );
      const link = screen.getByRole("link", { name: /view details/i });
      expect(link).toHaveAttribute("data-disabled", "true");
    });

    it("renders with light variant styling", () => {
      renderWithRouter(<ActionCardButton label="View details" />);
      const link = screen.getByRole("link", { name: /view details/i });
      expect(link.className).toContain("mantine");
    });
  });
});
