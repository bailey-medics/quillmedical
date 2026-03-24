import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ErrorText from "./ErrorText";

describe("ErrorText", () => {
  it("renders children text", () => {
    renderWithMantine(<ErrorText>Something went wrong</ErrorText>);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders with mantine Text root class", () => {
    renderWithMantine(<ErrorText>Error message</ErrorText>);

    const element = screen.getByText("Error message");
    expect(element).toHaveClass("mantine-Text-root");
  });

  it("renders with bold font weight", () => {
    renderWithMantine(<ErrorText>Bold error</ErrorText>);

    const element = screen.getByText("Bold error");
    expect(element).toHaveStyle({ fontWeight: 700 });
  });
});
