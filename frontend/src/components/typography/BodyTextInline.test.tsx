import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import BodyTextInline from "./BodyTextInline";

describe("BodyTextInline", () => {
  it("renders children text", () => {
    renderWithMantine(<BodyTextInline>Hello world</BodyTextInline>);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    renderWithMantine(<BodyTextInline>Inline text</BodyTextInline>);

    const element = screen.getByText("Inline text");
    expect(element.tagName).toBe("SPAN");
  });

  it("preserves whitespace for multiline messages", () => {
    renderWithMantine(<BodyTextInline>{"Line one\nLine two"}</BodyTextInline>);

    const element = screen.getByText(/Line one/);
    expect(element).toHaveStyle({ whiteSpace: "pre-wrap" });
  });
});
