import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import HeroBackground from "./HeroBackground";

describe("HeroBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <HeroBackground>
        <p>Hello world</p>
      </HeroBackground>,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders the outer container", () => {
    renderWithMantine(<HeroBackground />);
    expect(screen.getByTestId("hero-background")).toBeInTheDocument();
  });

  it("renders two decorative layers", () => {
    renderWithMantine(<HeroBackground />);
    expect(screen.getByTestId("hero-glow")).toBeInTheDocument();
    expect(screen.getByTestId("hero-grid")).toBeInTheDocument();
  });

  it("renders the content slot", () => {
    renderWithMantine(
      <HeroBackground>
        <p>Content</p>
      </HeroBackground>,
    );
    expect(screen.getByTestId("hero-content")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
