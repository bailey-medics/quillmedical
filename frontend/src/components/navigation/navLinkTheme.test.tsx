/**
 * NavLink theme override tests
 *
 * The theme points the current link's colour at the amber
 * `--nav-active-colour` token and tags each NavLink with the classes
 * that recolour its icon.
 */

import { NavLink } from "@mantine/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import NavIcon from "@/components/icons/NavIcon";

describe("NavLink theme override", () => {
  it("sets the active colour to the amber nav token", () => {
    renderWithMantine(
      <NavLink label="Home" active leftSection={<NavIcon name="home" />} />,
    );

    const root = screen.getByText("Home").closest("[data-active]");
    expect(root).not.toBeNull();
    expect((root as HTMLElement).style.getPropertyValue("--nl-color")).toBe(
      "var(--nav-active-colour)",
    );
  });

  it("gives the current link no background fill", () => {
    renderWithMantine(<NavLink label="Home" active />);

    const root = screen.getByText("Home").closest("[data-active]");
    expect((root as HTMLElement).style.getPropertyValue("--nl-bg")).toBe(
      "transparent",
    );
    expect((root as HTMLElement).style.getPropertyValue("--nl-hover")).toBe(
      "var(--nav-hover-bg)",
    );
  });

  it("applies the override classes to the root and icon section", () => {
    const { container } = renderWithMantine(
      <NavLink label="Home" active leftSection={<NavIcon name="home" />} />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.parentElement?.className).toMatch(/section/);
    expect(
      screen.getByText("Home").closest("[data-active]")?.className,
    ).toMatch(/root/);
  });
});
