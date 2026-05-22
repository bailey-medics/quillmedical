/**
 * PictureActionCard Component Tests
 *
 * Tests for the card component with optional cover image,
 * title, description, and call-to-action button.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, renderWithRouter } from "@/test/test-utils";
import PictureActionCard from "./PictureActionCard";

describe("PictureActionCard", () => {
  const defaultProps = {
    title: "Colorectal Polyps",
    description: "Morphology categories of superficial lesions.",
    imageSrc: "/storybook/paris-classification.png",
    imageAlt: "Paris classification",
    buttonLabel: "View module",
    buttonUrl: "/teaching/colorectal-polyps",
  };

  describe("Basic rendering", () => {
    it("renders title", () => {
      renderWithRouter(<PictureActionCard {...defaultProps} />);
      expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
    });

    it("renders description", () => {
      renderWithRouter(<PictureActionCard {...defaultProps} />);
      expect(
        screen.getByText("Morphology categories of superficial lesions."),
      ).toBeInTheDocument();
    });

    it("renders button with label", () => {
      renderWithRouter(<PictureActionCard {...defaultProps} />);
      expect(
        screen.getByRole("link", { name: /View module/i }),
      ).toBeInTheDocument();
    });

    it("renders image when imageSrc is provided", () => {
      renderWithRouter(<PictureActionCard {...defaultProps} />);
      const img = screen.getByRole("img", { name: "Paris classification" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "/storybook/paris-classification.png");
    });
  });

  describe("Navigation", () => {
    it("renders link with correct URL", () => {
      renderWithRouter(<PictureActionCard {...defaultProps} />);
      const link = screen.getByRole("link", { name: /View module/i });
      expect(link).toHaveAttribute("href", "/teaching/colorectal-polyps");
    });
  });

  describe("onClick", () => {
    it("calls onClick when provided", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithMantine(
        <PictureActionCard {...defaultProps} onClick={handleClick} />,
      );
      await user.click(screen.getByRole("button", { name: /View module/i }));
      expect(handleClick).toHaveBeenCalledOnce();
    });
  });
});
