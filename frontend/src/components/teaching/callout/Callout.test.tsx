import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import Callout from "./Callout";

describe("Callout", () => {
  it("renders children text", () => {
    renderWithMantine(<Callout type="info">Important note</Callout>);
    expect(screen.getByText("Important note")).toBeInTheDocument();
  });

  it("renders as an alert element", () => {
    renderWithMantine(<Callout type="warning">Careful here</Callout>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders info variant", () => {
    renderWithMantine(<Callout type="info">Info text</Callout>);
    expect(screen.getByText("Info text")).toBeInTheDocument();
  });

  it("renders warning variant", () => {
    renderWithMantine(<Callout type="warning">Warning text</Callout>);
    expect(screen.getByText("Warning text")).toBeInTheDocument();
  });

  it("renders success variant", () => {
    renderWithMantine(<Callout type="success">Success text</Callout>);
    expect(screen.getByText("Success text")).toBeInTheDocument();
  });
});
