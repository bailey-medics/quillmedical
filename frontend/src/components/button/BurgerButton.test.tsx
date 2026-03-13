/**
 * BurgerButton Component Tests
 *
 * Tests for the BurgerButton component covering:
 * - Rendering with correct aria attributes
 * - Click interactions
 * - Open/closed state labels
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import BurgerButton from "./BurgerButton";

describe("BurgerButton", () => {
  describe("Rendering", () => {
    it("renders as a button", () => {
      renderWithMantine(<BurgerButton navOpen={false} onClick={vi.fn()} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders the menu icon", () => {
      renderWithMantine(<BurgerButton navOpen={false} onClick={vi.fn()} />);
      const svg = screen.getByRole("button").querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Aria attributes", () => {
    it("has aria-label 'Open navigation' when closed", () => {
      renderWithMantine(<BurgerButton navOpen={false} onClick={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Open navigation" }),
      ).toBeInTheDocument();
    });

    it("has aria-label 'Close navigation' when open", () => {
      renderWithMantine(<BurgerButton navOpen={true} onClick={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Close navigation" }),
      ).toBeInTheDocument();
    });

    it("has aria-expanded false when closed", () => {
      renderWithMantine(<BurgerButton navOpen={false} onClick={vi.fn()} />);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("has aria-expanded true when open", () => {
      renderWithMantine(<BurgerButton navOpen={true} onClick={vi.fn()} />);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("has aria-controls pointing to app-navbar", () => {
      renderWithMantine(<BurgerButton navOpen={false} onClick={vi.fn()} />);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-controls",
        "app-navbar",
      );
    });
  });

  describe("Interactions", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(<BurgerButton navOpen={false} onClick={handleClick} />);

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
