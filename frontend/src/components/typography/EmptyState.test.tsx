import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders children text", () => {
    renderWithMantine(<EmptyState>Type a message...</EmptyState>);

    expect(screen.getByText("Type a message...")).toBeInTheDocument();
  });

  it("renders with mantine Text root class", () => {
    renderWithMantine(<EmptyState>Placeholder</EmptyState>);

    const element = screen.getByText("Placeholder");
    expect(element).toHaveClass("mantine-Text-root");
  });

  it("uses placeholder colour from CSS variable", () => {
    renderWithMantine(<EmptyState>Grey text</EmptyState>);

    const element = screen.getByText("Grey text");
    expect(element).toHaveStyle({
      color: "var(--mantine-color-gray-4)",
    });
  });
});
