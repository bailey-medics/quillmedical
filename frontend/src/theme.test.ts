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
import { AA_TEXT, contrastRatio } from "@lib/colour-contrast/contrast";
import brand from "@/generated/brand.json";
import {
  brandColours,
  cssVariablesResolver,
  greyScale,
  primaryScale,
  secondaryScale,
  statusColourValues,
  statusTextColourValues,
  theme,
} from "./theme";

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
    expect(vars.variables["--brand-mark"]).toBe(brand.brand.mark);
    expect(vars.variables["--success-color"]).toBeDefined();
    expect(vars.light["--mantine-color-text"]).toBe("#143f6b");
    expect(vars.dark["--mantine-color-body"]).toBe("#001a36");
  });

  it("colours the current nav link amber, darker in light mode", () => {
    // secondary.5 is 2.7:1 on white, under WCAG AA; secondary.7 is 5.5:1
    expect(vars.light["--nav-active-colour"]).toBe(
      "var(--mantine-color-secondary-7)",
    );
    expect(contrastRatio(secondaryScale[7], "#ffffff")).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
    expect(vars.dark["--nav-active-colour"]).toBe(
      "var(--mantine-color-secondary-5)",
    );
  });

  it("lets app overrides win over Mantine's values", () => {
    // Mantine's resolver sets --mantine-color-error to a red shade; the
    // app overrides it with its accessible error token.
    expect(vars.light["--mantine-color-error"]).toBe("var(--error-color)");
    expect(vars.dark["--mantine-color-error"]).toBe("var(--error-color)");
  });
});

describe("dimmed text contrast", () => {
  // The surfaces dimmed text sits on in each scheme: body, striped rows
  // and card backgrounds in light; body, card and input navy in dark.
  const lightSurfaces = ["#ffffff", greyScale[0], greyScale[1], greyScale[2]];
  const darkSurfaces = ["#001a36", "#042340", "#0a2f56"];

  it.each(lightSurfaces)("passes WCAG AA on %s in light mode", (surface) => {
    const dimmed = vars.light["--mantine-color-dimmed"];
    expect(contrastRatio(dimmed, surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(darkSurfaces)("passes WCAG AA on %s in dark mode", (surface) => {
    const dimmed = vars.dark["--mantine-color-dimmed"];
    expect(contrastRatio(dimmed, surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("status colour contrast", () => {
  // Fills that take white text, and the two pale fills that take the
  // near-black `--status-text-dark`.
  const whiteText = [
    "success",
    "warning",
    "outstanding",
    "info",
    "accent",
    "alert",
  ] as const;
  const darkText = ["neutral", "update"] as const;

  it.each(whiteText)("white text passes WCAG AA on the %s fill", (name) => {
    expect(
      contrastRatio("#ffffff", statusColourValues[name]),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(darkText)("dark text passes WCAG AA on the %s fill", (name) => {
    expect(
      contrastRatio(
        vars.variables["--status-text-dark"],
        statusColourValues[name],
      ),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const lightSurfaces = ["#ffffff", greyScale[0], greyScale[1], greyScale[2]];
  const darkSurfaces = ["#000d1f", "#001a36", "#042340", "#0a2f56"];
  const names = Object.keys(
    statusTextColourValues.light,
  ) as (keyof typeof statusTextColourValues.light)[];

  it.each(names)("%s text passes WCAG AA on every light surface", (name) => {
    for (const surface of lightSurfaces) {
      expect(
        contrastRatio(statusTextColourValues.light[name], surface),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(names)("%s text passes WCAG AA on every dark surface", (name) => {
    for (const surface of darkSurfaces) {
      expect(
        contrastRatio(statusTextColourValues.dark[name], surface),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("registers the text colours as scheme variables", () => {
    expect(vars.light["--alert-text-color"]).toBe(
      statusTextColourValues.light.alert,
    );
    expect(vars.dark["--alert-text-color"]).toBe(
      statusTextColourValues.dark.alert,
    );
  });
});

describe("error and link contrast", () => {
  const lightSurfaces = ["#ffffff", greyScale[0], greyScale[1], greyScale[2]];
  const darkSurfaces = ["#001a36", "#042340", "#0a2f56"];
  const tokens = [
    "--error-color",
    "--link-color",
    "--link-hover-color",
  ] as const;

  it.each(tokens)("%s passes WCAG AA on every light surface", (name) => {
    for (const surface of lightSurfaces) {
      expect(contrastRatio(vars.light[name], surface)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  it.each(tokens)("%s passes WCAG AA on every dark surface", (name) => {
    for (const surface of darkSurfaces) {
      expect(contrastRatio(vars.dark[name], surface)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  it("keeps body text readable on my chat bubble in dark mode", () => {
    expect(
      contrastRatio(
        vars.dark["--mantine-color-text"],
        vars.dark["--bubble-mine-bg"],
      ),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("motion and focus", () => {
  it("respects a system request for reduced motion", () => {
    // Mantine defaults this to false, which ignores the OS setting.
    expect(resolved.respectReducedMotion).toBe(true);
  });

  it("shows the focus ring for keyboard focus", () => {
    expect(resolved.focusRing).toBe("auto");
  });
});

describe("anchor colour", () => {
  it("points Mantine's anchor colour at the link token in both schemes", () => {
    // Otherwise stylesheet order decides between Mantine's primary.4 and
    // the link token, and the production build picked primary.4.
    expect(vars.light["--mantine-color-anchor"]).toBe("var(--link-color)");
    expect(vars.dark["--mantine-color-anchor"]).toBe("var(--link-color)");
  });
});

describe("PublicButton's amber fill", () => {
  const text = vars.variables["--button-text-dark"];
  const pressed = vars.variables["--button-active-bg"];

  it("keeps the navy text at WCAG AA at rest, on hover and when pressed", () => {
    expect(text).toBe(primaryScale[8]);
    // Resting is secondary.5, hover secondary.6, as PublicButton.module.css
    for (const fill of [secondaryScale[5], secondaryScale[6], pressed]) {
      expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("is never darker when pressed than on hover", () => {
    expect(contrastRatio(text, pressed)).toBeGreaterThanOrEqual(
      contrastRatio(text, secondaryScale[6]),
    );
  });
});

describe("the theme reads its colours from shared/brand.yaml", () => {
  it("takes the brand colours and ramps from the brand file", () => {
    expect(brandColours).toEqual(brand.brand);
    expect([...primaryScale]).toEqual(brand.palette.primary);
    expect([...secondaryScale]).toEqual(brand.palette.secondary);
    expect([...greyScale]).toEqual(brand.palette.grey);
  });

  it("keeps the brand primary at shade 8 and the brand amber at shade 5", () => {
    expect(primaryScale[8]).toBe(brandColours.primary);
    expect(secondaryScale[5]).toBe(brandColours.secondary.toLowerCase());
  });
});
