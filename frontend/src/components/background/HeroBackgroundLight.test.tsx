import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import HeroBackgroundLight from "./HeroBackgroundLight";

describe("HeroBackgroundLight", () => {
  it("renders children", () => {
    renderWithMantine(
      <HeroBackgroundLight>
        <p>Hello</p>
      </HeroBackgroundLight>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders the outer container with data-testid", () => {
    renderWithMantine(<HeroBackgroundLight />);
    expect(screen.getByTestId("hero-background-light")).toBeInTheDocument();
  });

  it("renders without children", () => {
    renderWithMantine(<HeroBackgroundLight />);
    expect(screen.getByTestId("hero-background-light")).toBeInTheDocument();
  });
});
