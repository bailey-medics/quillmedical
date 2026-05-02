import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import BodyTextMuted from "./BodyTextMuted";

describe("BodyTextMuted", () => {
  it("renders children text", () => {
    renderWithMantine(<BodyTextMuted>Secondary info</BodyTextMuted>);

    expect(screen.getByText("Secondary info")).toBeInTheDocument();
  });

  it("applies dimmed colour", () => {
    renderWithMantine(<BodyTextMuted>Muted text</BodyTextMuted>);

    const element = screen.getByText("Muted text");
    expect(element).toHaveStyle({ color: "var(--mantine-color-dimmed)" });
  });
});
