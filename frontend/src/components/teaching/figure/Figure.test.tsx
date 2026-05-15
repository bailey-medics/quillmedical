import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import Figure from "./Figure";

describe("Figure", () => {
  it("renders the image with correct alt text", () => {
    renderWithMantine(
      <Figure src="https://example.com/image.png" alt="Test image" />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Test image");
  });

  it("renders the image with correct src", () => {
    renderWithMantine(
      <Figure src="https://example.com/image.png" alt="Test image" />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/image.png",
    );
  });

  it("renders caption when provided", () => {
    renderWithMantine(
      <Figure
        src="https://example.com/image.png"
        alt="Test"
        caption="Figure 1: Overview"
      />,
    );
    expect(screen.getByText("Figure 1: Overview")).toBeInTheDocument();
  });

  it("does not render caption when not provided", () => {
    const { container } = renderWithMantine(
      <Figure src="https://example.com/image.png" alt="Test" />,
    );
    // Only the image should be rendered, no caption text
    expect(container.querySelectorAll("figure > *")).toHaveLength(1);
  });
});
