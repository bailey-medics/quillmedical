import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import BodyTextBlack from "./BodyTextBlack";

describe("BodyTextBlack", () => {
  it("renders children text", () => {
    renderWithMantine(<BodyTextBlack>Hello world</BodyTextBlack>);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders with black colour", () => {
    renderWithMantine(<BodyTextBlack>Black text</BodyTextBlack>);

    const element = screen.getByText("Black text");
    expect(element).toHaveClass("mantine-Text-root");
  });

  it("preserves whitespace for multiline messages", () => {
    renderWithMantine(<BodyTextBlack>{"Line one\nLine two"}</BodyTextBlack>);

    const element = screen.getByText(/Line one/);
    expect(element).toHaveStyle({ whiteSpace: "pre-wrap" });
  });
});
