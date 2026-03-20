import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import LightBackground from "./LightBackground";

describe("LightBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <LightBackground>
        <p>Hello</p>
      </LightBackground>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders the outer container with data-testid", () => {
    renderWithMantine(<LightBackground />);
    expect(screen.getByTestId("light-background")).toBeInTheDocument();
  });

  it("renders without children", () => {
    renderWithMantine(<LightBackground />);
    expect(screen.getByTestId("light-background")).toBeInTheDocument();
  });
});
