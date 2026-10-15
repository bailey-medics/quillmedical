/**
 * Breakpoint tests
 *
 * A component reads `theme.breakpoints.sm`; a CSS module reads
 * `$mantine-breakpoint-sm`, which PostCSS fills in at build time. The two
 * were separate lists once, and `sm` was 40em in one and 48em in the other,
 * so JavaScript and CSS switched layout 128px apart. Both now come from
 * breakpoints.json, and these tests fail if either goes back to a list of
 * its own.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import postcssConfig from "../postcss.config";
import breakpoints from "./breakpoints.json";
import { theme } from "./theme";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The `variables` handed to postcss-simple-vars in postcss.config.ts. */
function postcssVariables(): Record<string, string> {
  return postcssConfig.plugins["postcss-simple-vars"].variables;
}

describe("breakpoints", () => {
  it("keeps sm at 40em, the documented mobile/desktop split", () => {
    expect(breakpoints.sm).toBe("40em");
  });

  it("gives the Mantine theme the values in breakpoints.json", () => {
    expect(theme.breakpoints).toEqual(breakpoints);
  });

  it("gives PostCSS the same width as the theme for every breakpoint", () => {
    const fromTheme = Object.fromEntries(
      Object.entries(theme.breakpoints ?? {}).map(([name, width]) => [
        `mantine-breakpoint-${name}`,
        width,
      ]),
    );

    expect(Object.keys(fromTheme)).toHaveLength(5);
    expect(postcssVariables()).toEqual(fromTheme);
  });

  it.each([".storybook/main.ts", "public_pages/vite.config.ts"])(
    "%s reads breakpoints.json rather than listing widths of its own",
    (path) => {
      const source = readFileSync(resolve(frontendRoot, path), "utf8");

      expect(source).toContain("src/breakpoints.json");
      expect(source).not.toMatch(/"mantine-breakpoint-\w+"\s*:/);
    },
  );
});
