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
import {
  AA_LARGE_OR_GRAPHIC,
  AA_TEXT,
  contrastRatio,
} from "@lib/colour-contrast/contrast";
import brand from "@/generated/brand.json";
import baseline from "./theme.quill-baseline.json";
import {
  BRAND_NAMES,
  brandColours,
  cssVariablesResolver,
  makeTheme,
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

  it("fills the current nav link with a mild grey the amber still reads on", () => {
    expect(vars.light["--nav-active-bg"]).toBe("var(--mantine-color-gray-1)");
    expect(
      contrastRatio(secondaryScale[7], greyScale[1]),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(vars.dark["--nav-active-bg"]).toBe("var(--mantine-color-dark-6)");
    expect(
      contrastRatio(secondaryScale[5], DEFAULT_THEME.colors.dark[6]),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("softens the error colour for a placeholder in an errored field", () => {
    // Derived from --error-color rather than a second red, so it follows
    // the error colour in both schemes and thins towards the field.
    expect(vars.variables["--error-placeholder-color"]).toBe(
      "color-mix(in srgb, var(--error-color) 55%, transparent)",
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

describe("makeTheme", () => {
  it("gives Quill exactly the variables it had before brands existed", () => {
    // Recorded from theme.ts on 6 November 2026, before makeTheme: every
    // variable theme.ts sets itself, in each scheme. Mantine's own are
    // left out, so a Mantine upgrade does not break this.
    const before = baseline as Record<
      "variables" | "light" | "dark",
      Record<string, string>
    > & { black: string };

    expect(resolved.black).toBe(before.black);

    for (const scheme of ["variables", "light", "dark"] as const) {
      const now: Record<string, string> = { ...vars[scheme] };

      for (const [name, value] of Object.entries(before[scheme])) {
        expect([scheme, name, now[name]]).toEqual([scheme, name, value]);
      }
    }
  });

  it("builds the same Quill theme the app uses", () => {
    const quill = makeTheme("quill");
    const rebuilt = mergeMantineTheme(DEFAULT_THEME, quill.theme);

    // Through JSON: each build makes its own NavLink `vars` function, so
    // the two are equal in what they hold but never the same function.
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(
      JSON.parse(JSON.stringify(resolved)),
    );
    expect(quill.cssVariablesResolver(rebuilt)).toEqual(vars);
    expect(resolved.other.brand).toBe("quill");
    expect(resolved.other.logo).toBeUndefined();
    expect(resolved.other.wordmark).toBeUndefined();
  });

  it("builds Let's Do Digital from its entry in the brand file", () => {
    const ldd = brand.app_themes["ldd"];
    const built = mergeMantineTheme(DEFAULT_THEME, makeTheme("ldd").theme);

    expect(ldd).toBeDefined();
    expect([...built.colors.primary]).toEqual(ldd?.palette.primary);
    expect([...built.colors.secondary]).toEqual(ldd?.palette.secondary);
    expect(built.black).toBe(ldd?.palette.primary[5]);
    expect(built.other).toEqual({
      brand: "ldd",
      colours: ldd?.brand,
      logo: "/brands/ldd/logo.png",
      logoTile: "#ffffff",
      wordmark: {
        src: "/brands/ldd/wordmark-white.svg",
        darkSrc: "/brands/ldd/wordmark-dark.svg",
        alt: "Let's Do Digital",
      },
    });
  });

  it("points Let's Do Digital's brand and dark-mode surfaces at its own colours", () => {
    const ldd = makeTheme("ldd");
    const built = mergeMantineTheme(DEFAULT_THEME, ldd.theme);
    const lddVars = ldd.cssVariablesResolver(built);
    const blue = brand.app_themes["ldd"]?.palette.primary ?? [];

    expect(lddVars.variables["--brand-primary"]).toBe("#0848a9");
    expect(lddVars.variables["--brand-secondary"]).toBe("#d0d0d0");
    expect(lddVars.dark["--mantine-color-body"]).toBe(blue[8]);
    expect(lddVars.dark["--card-bg"]).toBe(blue[7]);
    expect(lddVars.light["--mantine-color-text"]).toBe(blue[5]);
  });

  it("keeps Let's Do Digital's logo and wordmark when nested inside Quill's theme", () => {
    // As MantineThemeProvider merges a story's theme over Storybook's.
    // Quill's theme must not carry the keys as undefined: Mantine's
    // deepMerge turns undefined merged with an object into {}.
    const nested = mergeMantineTheme(resolved, makeTheme("ldd").theme);

    expect(nested.other.logo).toBe("/brands/ldd/logo.png");
    expect(nested.other.wordmark?.alt).toBe("Let's Do Digital");
    expect("wordmark" in resolved.other).toBe(false);
  });

  it("carries each brand's four colours on the theme", () => {
    const ldd = mergeMantineTheme(DEFAULT_THEME, makeTheme("ldd").theme);

    expect(resolved.other.colours).toEqual(brandColours);
    expect(ldd.other.colours).toEqual({
      primary: "#0848a9",
      secondary: "#d0d0d0",
      background: "#ffffff",
      mark: "#ffffff",
    });
  });

  it("gives the ribbon's idle mail icon each brand's own colour", () => {
    const ldd = makeTheme("ldd");
    const lddVars = ldd.cssVariablesResolver(
      mergeMantineTheme(DEFAULT_THEME, ldd.theme),
    );

    expect(vars.variables["--ribbon-icon-idle"]).toBe(greyScale[6]);
    expect(lddVars.variables["--ribbon-icon-idle"]).toBe("#c0c0c0");
  });

  it.each(BRAND_NAMES)(
    "gives %s's ribbon the dark page's colour in dark mode, and its brand primary in light",
    (name) => {
      const built = makeTheme(name);
      const resolvedBrand = mergeMantineTheme(DEFAULT_THEME, built.theme);
      const brandVars = built.cssVariablesResolver(resolvedBrand);

      expect(brandVars.dark["--ribbon-bg"]).toBe(
        brandVars.dark["--mantine-color-body"],
      );
      expect(brandVars.light["--ribbon-bg"]).toBe(
        resolvedBrand.other.colours?.primary,
      );
    },
  );

  it.each(BRAND_NAMES)(
    "keeps %s's idle mail icon at 3:1 or more on its ribbon in both schemes",
    (name) => {
      const built = makeTheme(name);
      const brandVars = built.cssVariablesResolver(
        mergeMantineTheme(DEFAULT_THEME, built.theme),
      );
      const icon = brandVars.variables["--ribbon-icon-idle"] ?? "";

      for (const scheme of ["light", "dark"] as const) {
        expect(
          contrastRatio(icon, brandVars[scheme]["--ribbon-bg"] ?? ""),
        ).toBeGreaterThanOrEqual(AA_LARGE_OR_GRAPHIC);
      }
    },
  );

  // Every app theme's text colours, held to WCAG AA as Quill's are
  // above. An app theme's link and current nav link once fell short in
  // light mode, found by the Storybook accessibility test.
  it.each(Object.keys(brand.app_themes))(
    "keeps %s's light-mode text at 4.5:1 or more",
    (name) => {
      const built = makeTheme(name);
      const light = built.cssVariablesResolver(
        mergeMantineTheme(DEFAULT_THEME, built.theme),
      ).light;
      const ramps = brand.app_themes[name];

      expect(
        contrastRatio(light["--link-color"] ?? "", "#ffffff"),
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrastRatio(ramps?.palette.secondary[7] ?? "", greyScale[1] ?? ""),
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrastRatio(ramps?.palette.primary[5] ?? "", "#ffffff"),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it("lists Quill first, then every app theme", () => {
    expect(BRAND_NAMES).toEqual(["quill", ...Object.keys(brand.app_themes)]);
    expect(BRAND_NAMES).toContain("ldd");
  });

  it.each(["purple", "constructor", ""])(
    "refuses a brand the file does not hold: %j",
    (name) => {
      expect(() => makeTheme(name)).toThrow(/Unknown brand/);
    },
  );
});
