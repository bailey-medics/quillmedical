import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import DarkBackground from "./DarkBackground";

describe("DarkBackground", () => {
  it("renders children", () => {
    renderWithMantine(
      <DarkBackground>
        <p>Hello</p>
      </DarkBackground>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders the outer container with data-testid", () => {
    renderWithMantine(<DarkBackground />);
    expect(screen.getByTestId("dark-background")).toBeInTheDocument();
  });

  it("renders without children", () => {
    renderWithMantine(<DarkBackground />);
    expect(screen.getByTestId("dark-background")).toBeInTheDocument();
  });
});
