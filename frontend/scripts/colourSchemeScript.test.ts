// frontend/scripts/colourSchemeScript.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLOUR_SCHEME_URL, compileColourScheme } from "./colourSchemeScript";

const frontend = path.resolve(__dirname, "..");
const source = path.join(frontend, "src/colour-scheme.ts");

describe("the colour scheme script", () => {
  it("compiles to a plain script that sets the scheme", async () => {
    const code = await compileColourScheme(source);

    expect(code).toContain("data-mantine-color-scheme");
    expect(code).toContain("mantine-color-scheme-value");
    // A plain script: no module syntax, which a classic <script> would
    // refuse, and no type left behind
    expect(code).not.toMatch(/^\s*(import|export)\b/m);
    expect(code).not.toMatch(/:\s*string\b/);
  });

  it("is loaded by index.html as a classic, blocking script", () => {
    const html = readFileSync(path.join(frontend, "index.html"), "utf8");
    const tag = html.match(
      new RegExp(`<script[^>]*src="${COLOUR_SCHEME_URL}"[^>]*>`),
    );

    expect(tag).not.toBeNull();
    expect(tag?.[0]).not.toMatch(/type="module"|defer|async/);
  });
});
