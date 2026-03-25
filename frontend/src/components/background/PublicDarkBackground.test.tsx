import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PublicDarkBackground from "./PublicDarkBackground";

describe("PublicDarkBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <PublicDarkBackground>
        <p>Hello</p>
      </PublicDarkBackground>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders the outer container with data-testid", () => {
    renderWithMantine(<PublicDarkBackground />);
    expect(screen.getByTestId("dark-background")).toBeInTheDocument();
  });

  it("renders without children", () => {
    renderWithMantine(<PublicDarkBackground />);
    expect(screen.getByTestId("dark-background")).toBeInTheDocument();
  });
});
