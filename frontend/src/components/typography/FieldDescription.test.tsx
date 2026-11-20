import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import FieldDescription from "./FieldDescription";

describe("FieldDescription", () => {
  it("renders children text", () => {
    renderWithMantine(<FieldDescription>Some description</FieldDescription>);
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  // Mantine puts a field's description inside its own <p>, which cannot
  // hold another paragraph.
  it("renders as a block-level span, so it can sit inside a paragraph", () => {
    renderWithMantine(<FieldDescription>Description text</FieldDescription>);
    const el = screen.getByText("Description text");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveStyle({ display: "block" });
  });

  it("applies grey colour class", () => {
    renderWithMantine(<FieldDescription>Greyed text</FieldDescription>);
    const el = screen.getByText("Greyed text");
    expect(el.className).toContain("mantine");
  });
});
