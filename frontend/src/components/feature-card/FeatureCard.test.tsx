import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import { FeatureCard } from "./FeatureCard";
import { IconMessage } from "@tabler/icons-react";

describe("FeatureCard", () => {
  const defaultProps = {
    icon: IconMessage,
    title: "Structured Clinical Records",
    body: "OpenEHR archetypes ensure clinical data is semantically rich.",
  };

  it("renders the icon", () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    expect(
      screen.getByTestId("feature-card").querySelector("svg"),
    ).toBeInTheDocument();
  });

  it("renders the title", () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    expect(screen.getByText("Structured Clinical Records")).toBeInTheDocument();
  });

  it("renders the body", () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    expect(screen.getByText(/OpenEHR archetypes ensure/)).toBeInTheDocument();
  });

  it("renders with data-testid", () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    expect(screen.getByTestId("feature-card")).toBeInTheDocument();
  });

  it("does not have clickable class without onClick", () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    const card = screen.getByTestId("feature-card");
    expect(card.className).not.toMatch(/clickable/);
  });

  it("has clickable class with onClick", () => {
    renderWithMantine(<FeatureCard {...defaultProps} onClick={() => {}} />);
    const card = screen.getByTestId("feature-card");
    expect(card.className).toMatch(/clickable/);
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    renderWithMantine(<FeatureCard {...defaultProps} onClick={handleClick} />);
    await userEvent.click(screen.getByTestId("feature-card"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("does not throw when clicked without onClick", async () => {
    renderWithMantine(<FeatureCard {...defaultProps} />);
    await userEvent.click(screen.getByTestId("feature-card"));
  });
});
