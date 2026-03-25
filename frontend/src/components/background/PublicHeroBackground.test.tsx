import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import PublicHeroBackground from "./PublicHeroBackground";

describe("PublicHeroBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <PublicHeroBackground>
        <p>Hello world</p>
      </PublicHeroBackground>,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders the outer container", () => {
    renderWithMantine(<PublicHeroBackground />);
    expect(screen.getByTestId("hero-background")).toBeInTheDocument();
  });

  it("renders two decorative layers", () => {
    renderWithMantine(<PublicHeroBackground />);
    expect(screen.getByTestId("hero-glow")).toBeInTheDocument();
    expect(screen.getByTestId("hero-grid")).toBeInTheDocument();
  });

  it("renders the content slot", () => {
    renderWithMantine(
      <PublicHeroBackground>
        <p>Content</p>
      </PublicHeroBackground>,
    );
    expect(screen.getByTestId("hero-content")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
