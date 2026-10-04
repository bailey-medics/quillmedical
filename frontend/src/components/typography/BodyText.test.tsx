/**
 * BodyText Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import BodyText from "./BodyText";

describe("BodyText", () => {
  it("renders children", () => {
    renderWithMantine(<BodyText>Hello world</BodyText>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders as a paragraph element", () => {
    renderWithMantine(<BodyText>Paragraph</BodyText>);
    expect(screen.getByText("Paragraph").tagName).toBe("P");
  });

  it("collapses line breaks unless asked to keep them", () => {
    renderWithMantine(<BodyText>{"First line\nSecond line"}</BodyText>);
    expect(screen.getByText("First line Second line")).not.toHaveStyle({
      whiteSpace: "pre-wrap",
    });
  });

  it("keeps line breaks with preserveLines", () => {
    renderWithMantine(
      <BodyText preserveLines>{"First line\nSecond line"}</BodyText>,
    );
    expect(screen.getByText("First line Second line")).toHaveStyle({
      whiteSpace: "pre-wrap",
    });
  });
});
