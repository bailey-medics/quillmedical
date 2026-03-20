import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PublicBurgerButton from "./PublicBurgerButton";

describe("PublicBurgerButton", () => {
  describe("Rendering", () => {
    it("renders as a button", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders the menu icon", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
      const svg = screen.getByRole("button").querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders with amber colour", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
      const button = screen.getByRole("button");
      expect(button.style.color).toBe("rgb(200, 150, 62)");
    });
  });

  describe("Aria attributes", () => {
    it("has aria-label 'Open navigation' when closed", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: "Open navigation" }),
      ).toBeInTheDocument();
    });

    it("has aria-label 'Close navigation' when open", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={true} onClick={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: "Close navigation" }),
      ).toBeInTheDocument();
    });

    it("has aria-expanded false when closed", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("has aria-expanded true when open", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={true} onClick={vi.fn()} />,
      );
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("has aria-controls pointing to app-navbar", () => {
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={vi.fn()} />,
      );
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
      renderWithMantine(
        <PublicBurgerButton navOpen={false} onClick={handleClick} />,
      );

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
