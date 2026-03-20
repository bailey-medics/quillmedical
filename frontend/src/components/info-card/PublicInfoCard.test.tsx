import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PublicInfoCard from "./PublicInfoCard";

describe("PublicInfoCard", () => {
  const defaultProps = {
    label: "Clinical letters",
    heading: "42",
    description: "Letters generated this month.",
  };

  it("renders the label text", () => {
    renderWithMantine(<PublicInfoCard {...defaultProps} />);
    expect(screen.getByText("Clinical letters")).toBeInTheDocument();
  });

  it("renders the heading text", () => {
    renderWithMantine(<PublicInfoCard {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "42" })).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderWithMantine(<PublicInfoCard {...defaultProps} />);
    expect(
      screen.getByText("Letters generated this month."),
    ).toBeInTheDocument();
  });

  it("renders with data-testid", () => {
    renderWithMantine(<PublicInfoCard {...defaultProps} />);
    expect(screen.getByTestId("public-info-card")).toBeInTheDocument();
  });

  it("renders heading as h2", () => {
    renderWithMantine(<PublicInfoCard {...defaultProps} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("42");
  });

  it("renders description as ReactNode", () => {
    renderWithMantine(
      <PublicInfoCard
        label="Test"
        heading="99"
        description={<span data-testid="custom">Custom content</span>}
      />,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });
});
