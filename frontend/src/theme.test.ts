/**
 * Theme tests
 *
 * Guards the CSS variables resolver, which layers the app's own
 * variables on top of Mantine's *Mantine 8* colour derivation. Mantine 9
 * changed how `-light` colour variants are computed, which made the
 * selected and hovered side-navigation links far heavier. These tests
 * pin the Mantine 8 behaviour so a future upgrade cannot quietly undo it.
 */

import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { cssVariablesResolver, primaryScale, theme } from "./theme";

const resolved = mergeMantineTheme(DEFAULT_THEME, theme);
const vars = cssVariablesResolver(resolved);

/** Hex → "r, g, b" so we can match Mantine's rgba() output loosely. */
function rgbTriplet(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

describe("cssVariablesResolver", () => {
  it("uses primary shade 5 as the primaryShade", () => {
    expect(resolved.primaryColor).toBe("primary");
    expect(resolved.primaryShade).toBe(5);
  });

  it("derives light-mode primary light variants the Mantine 8 way", () => {
    const shade5 = rgbTriplet(primaryScale[5]);

    expect(vars.light["--mantine-color-primary-light"]).toBe(
      `rgba(${shade5}, 0.1)`,
    );
    expect(vars.light["--mantine-color-primary-light-hover"]).toBe(
      `rgba(${shade5}, 0.12)`,
    );
    expect(vars.light["--mantine-color-primary-light-color"]).toBe(
      "var(--mantine-color-primary-5)",
    );
  });

  it("derives dark-mode primary light variants the Mantine 8 way", () => {
    // Mantine 8 used shade (primaryShade - 2) for the dark wash.
    const shade3 = rgbTriplet(primaryScale[3]);

    expect(vars.dark["--mantine-color-primary-light"]).toBe(
      `rgba(${shade3}, 0.15)`,
    );
    expect(vars.dark["--mantine-color-primary-light-hover"]).toBe(
      `rgba(${shade3}, 0.2)`,
    );
    expect(vars.dark["--mantine-color-primary-light-color"]).toBe(
      "var(--mantine-color-primary-0)",
    );
  });

  it("does not use the Mantine 9 solid-shade derivation", () => {
    // Mantine 9 defaults: shade 1 background, shade 2 hover, shade 9 text.
    expect(vars.light["--mantine-color-primary-light"]).not.toBe(
      "var(--mantine-color-primary-1)",
    );
    expect(vars.light["--mantine-color-primary-light-hover"]).not.toBe(
      "var(--mantine-color-primary-2)",
    );
    expect(vars.light["--mantine-color-primary-light-color"]).not.toBe(
      "var(--mantine-color-primary-9)",
    );
  });

  it("points the primary aliases at the primary colour variants", () => {
    expect(vars.variables["--mantine-primary-color-light"]).toBe(
      "var(--mantine-color-primary-light)",
    );
    expect(vars.variables["--mantine-primary-color-light-hover"]).toBe(
      "var(--mantine-color-primary-light-hover)",
    );
    expect(vars.variables["--mantine-primary-color-light-color"]).toBe(
      "var(--mantine-color-primary-light-color)",
    );
  });

  it("keeps the app's own variables", () => {
    expect(vars.variables["--brand-primary"]).toBeDefined();
    expect(vars.variables["--success-color"]).toBeDefined();
    expect(vars.light["--mantine-color-text"]).toBe("#143f6b");
    expect(vars.dark["--mantine-color-body"]).toBe("#001a36");
  });

  it("lets app overrides win over Mantine's values", () => {
    // Mantine's resolver sets --mantine-color-error to a red shade; the
    // app overrides it with its accessible error token.
    expect(vars.light["--mantine-color-error"]).toBe("var(--error-color)");
    expect(vars.dark["--mantine-color-error"]).toBe("var(--error-color)");
  });
});
