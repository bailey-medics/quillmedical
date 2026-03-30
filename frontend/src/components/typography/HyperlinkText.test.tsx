import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import HyperlinkText from "./HyperlinkText";

describe("HyperlinkText", () => {
  it("renders children text", () => {
    renderWithRouter(<HyperlinkText to="/register">Register</HyperlinkText>);
    expect(screen.getByText("Register")).toBeInTheDocument();
  });

  it("renders as a link", () => {
    renderWithRouter(<HyperlinkText to="/about">Learn more</HyperlinkText>);
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/about");
  });

  it("uses Mantine Anchor styling", () => {
    renderWithRouter(<HyperlinkText to="/register">Sign up</HyperlinkText>);
    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link).toHaveClass("mantine-Anchor-root");
  });
});
