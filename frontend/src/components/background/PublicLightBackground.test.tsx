import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PublicLightBackground from "./PublicLightBackground";

describe("PublicLightBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <PublicLightBackground>
        <p>Hello</p>
      </PublicLightBackground>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders the outer container with data-testid", () => {
    renderWithMantine(<PublicLightBackground />);
    expect(screen.getByTestId("light-background")).toBeInTheDocument();
  });

  it("renders without children", () => {
    renderWithMantine(<PublicLightBackground />);
    expect(screen.getByTestId("light-background")).toBeInTheDocument();
  });
});
