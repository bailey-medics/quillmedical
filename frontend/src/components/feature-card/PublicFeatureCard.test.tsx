import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import { PublicFeatureCard } from "./PublicFeatureCard";
import { IconMessage } from "@/components/icons/appIcons";

describe("PublicFeatureCard", () => {
  const defaultProps = {
    icon: IconMessage,
    title: "Structured Clinical Records",
    body: "OpenEHR archetypes ensure clinical data is semantically rich.",
  };

  it("renders the icon", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} />);
    expect(
      screen.getByTestId("feature-card").querySelector("svg"),
    ).toBeInTheDocument();
  });

  it("renders the title", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} />);
    expect(screen.getByText("Structured Clinical Records")).toBeInTheDocument();
  });

  it("renders the body", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} />);
    expect(screen.getByText(/OpenEHR archetypes ensure/)).toBeInTheDocument();
  });

  it("renders with data-testid", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} />);
    expect(screen.getByTestId("feature-card")).toBeInTheDocument();
  });

  it("renders as a div without href", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} />);
    const card = screen.getByTestId("feature-card");
    expect(card.tagName).toBe("DIV");
    expect(card.className).not.toMatch(/clickable/);
  });

  it("renders as an anchor with href", () => {
    renderWithMantine(<PublicFeatureCard {...defaultProps} href="/about" />);
    const card = screen.getByTestId("feature-card");
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", "/about");
    expect(card.className).toMatch(/clickable/);
  });

  it("does not set target on links", () => {
    renderWithMantine(
      <PublicFeatureCard {...defaultProps} href="https://example.com" />,
    );
    const card = screen.getByTestId("feature-card");
    expect(card).not.toHaveAttribute("target");
  });
});
