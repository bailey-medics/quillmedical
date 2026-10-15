/**
 * The restricted imports, and who is excused from which.
 *
 * Each exemption in eslint.config.js lifts one restriction for the files
 * that need it and keeps the rest. This pins that, because the config
 * once set the whole rule to "off" for each list, and the comment beside
 * each promised something narrower than the config delivered.
 */

import { ESLint } from "eslint";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** A file importing all four restricted things at once. */
const PROBE = [
  'import { ActionIcon, Loader, MantineProvider } from "@mantine/core";',
  'import { VariantRow } from "@/stories/variants";',
  "export const probe = [ActionIcon, Loader, MantineProvider, VariantRow];",
  "",
].join("\n");

const FRONTEND = path.resolve(__dirname, "../..");

/** What each restriction's message says, to name it in a result. */
const RESTRICTIONS = {
  MantineProvider: "Don't use MantineProvider",
  ActionIcon: "Use IconButton",
  Loader: "Use QuillSpinner",
  storiesHelpers: "Storybook helpers",
} as const;

type Restriction = keyof typeof RESTRICTIONS;

let eslint: ESLint;

/** The restrictions reported when `filePath` holds the probe. */
async function reportedAt(filePath: string): Promise<Restriction[]> {
  const [result] = await eslint.lintText(PROBE, { filePath });
  const broken = result.messages.find((m) => m.ruleId === null);
  if (broken)
    throw new Error(`ESLint could not lint ${filePath}: ${broken.message}`);
  const messages = result.messages.filter(
    (m) => m.ruleId === "no-restricted-imports",
  );

  return (Object.keys(RESTRICTIONS) as Restriction[]).filter((name) =>
    messages.some((m) => m.message.includes(RESTRICTIONS[name])),
  );
}

beforeAll(() => {
  // The real config, type-aware rules and all, so it costs the project
  // service's load once. The probe's path must be a file the project
  // knows, which is why each case names a real one.
  eslint = new ESLint({ cwd: FRONTEND });
});

describe("plain JavaScript", () => {
  it("is checked with the core rules and the browser's globals", async () => {
    const [result] = await eslint.lintText(
      "document.title = notDefinedAnywhere;\n",
      { filePath: "public/colour-scheme.js" },
    );

    expect(result.messages.map((m) => m.ruleId)).toEqual(["no-undef"]);
  });
});

describe("restricted imports", () => {
  it("reports all four in ordinary app code", async () => {
    expect(await reportedAt("src/pages/Home.tsx")).toEqual([
      "MantineProvider",
      "ActionIcon",
      "Loader",
      "storiesHelpers",
    ]);
  });

  it("excuses the app's entry point from MantineProvider only", async () => {
    expect(await reportedAt("src/main.tsx")).toEqual([
      "ActionIcon",
      "Loader",
      "storiesHelpers",
    ]);
  });

  it("excuses an icon-button wrapper from ActionIcon only", async () => {
    expect(await reportedAt("src/components/button/IconButton.tsx")).toEqual([
      "MantineProvider",
      "Loader",
      "storiesHelpers",
    ]);
  });

  it("excuses a button with a ring from Loader only", async () => {
    expect(await reportedAt("src/components/button/ButtonPairRed.tsx")).toEqual(
      ["MantineProvider", "ActionIcon", "storiesHelpers"],
    );
  });

  it("excuses a story from the stories helpers only", async () => {
    expect(
      await reportedAt("src/components/button/IconButton.stories.tsx"),
    ).toEqual(["MantineProvider", "ActionIcon", "Loader"]);
  });

  it("excuses a story with its own router from MantineProvider too", async () => {
    expect(
      await reportedAt(
        "src/components/error-boundary/RouteErrorFallback.stories.tsx",
      ),
    ).toEqual(["ActionIcon", "Loader"]);
  });
});
