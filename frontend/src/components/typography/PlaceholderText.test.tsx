import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import PlaceholderText from "./PlaceholderText";

describe("PlaceholderText", () => {
  it("renders children text", () => {
    renderWithMantine(<PlaceholderText>Type a message...</PlaceholderText>);

    expect(screen.getByText("Type a message...")).toBeInTheDocument();
  });

  it("renders with mantine Text root class", () => {
    renderWithMantine(<PlaceholderText>Placeholder</PlaceholderText>);

    const element = screen.getByText("Placeholder");
    expect(element).toHaveClass("mantine-Text-root");
  });

  it("uses placeholder colour from CSS variable", () => {
    renderWithMantine(<PlaceholderText>Grey text</PlaceholderText>);

    const element = screen.getByText("Grey text");
    expect(element).toHaveStyle({
      color: "var(--mantine-color-gray-4)",
    });
  });
});
