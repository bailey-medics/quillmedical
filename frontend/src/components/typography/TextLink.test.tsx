import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import TextLink from "./TextLink";

describe("TextLink", () => {
  it("renders children text", () => {
    renderWithRouter(<TextLink to="/register">Register</TextLink>);
    expect(screen.getByText("Register")).toBeInTheDocument();
  });

  it("renders as a link", () => {
    renderWithRouter(<TextLink to="/about">Learn more</TextLink>);
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/about");
  });

  it("uses Mantine Anchor styling", () => {
    renderWithRouter(<TextLink to="/register">Sign up</TextLink>);
    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link).toHaveClass("mantine-Anchor-root");
  });
});
