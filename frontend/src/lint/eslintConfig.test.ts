/**
 * The restricted imports, and who is excused from which.
 *
 * Each exemption in eslint.config.ts lifts one restriction for the files
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

beforeAll(async () => {
  // The real config, type-aware rules and all, so it costs the project
  // service's load once. The probe's path must be a file the project
  // knows, which is why each case names a real one.
  eslint = new ESLint({ cwd: FRONTEND });

  // That load is paid here, by one lint up front, rather than by
  // whichever case runs first: on a machine busy with the whole suite it
  // can take longer than a single test is allowed.
  await eslint.lintText("export {};\n", { filePath: "src/pages/Home.tsx" });
}, 120_000);

describe("type assertions", () => {
  /** The rules reported when `filePath` holds `code`. */
  async function rulesFor(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });

    return result.messages.map((m) => m.ruleId ?? "unparsed");
  }

  it("reports casting an object literal into a type", async () => {
    const code = [
      'import type { User } from "@/auth/AuthContext";',
      'export const user = { id: "1" } as User;',
      "",
    ].join("\n");

    expect(await rulesFor(code, "src/pages/Home.tsx")).toEqual([
      "@typescript-eslint/consistent-type-assertions",
    ]);
  });

  it("reports a type argument that only repeats its default", async () => {
    const code = [
      "type Box<T = string> = { value: T };",
      'export const box: Box<string> = { value: "" };',
      "",
    ].join("\n");

    expect(await rulesFor(code, "src/pages/Home.tsx")).toEqual([
      "@typescript-eslint/no-unnecessary-type-arguments",
    ]);
  });
});

describe("ways round the restricted imports", () => {
  /** The rules reported when a page holds `code`. */
  async function rulesInPage(code: string): Promise<string[]> {
    const [result] = await eslint.lintText(`${code}\n`, {
      filePath: "src/pages/Home.tsx",
    });

    return result.messages.map((m) => m.ruleId ?? "unparsed");
  }

  it.each([
    [
      "a stories helper by a relative path",
      'import { VariantRow } from "../stories/variants"; export const x = VariantRow;',
    ],
    [
      "a story file",
      'import { meta } from "../components/button/IconButton.stories"; export const x = meta;',
    ],
    [
      "a story file with its ending",
      'import meta from "./Thing.stories.tsx"; export const x = meta;',
    ],
    [
      "a Mantine name under another name",
      'import { Loader as Spinner } from "@mantine/core"; export const x = Spinner;',
    ],
    [
      "the whole of Mantine at once",
      'import * as M from "@mantine/core"; export const x = M.Loader;',
    ],
    ["a Mantine name passed on", 'export { Loader } from "@mantine/core";'],
  ])("reports importing %s", async (_, code) => {
    expect(await rulesInPage(code)).toContain("no-restricted-imports");
  });

  it("reports loading Mantine at run time", async () => {
    const code =
      'export const x = import("@mantine/core").then((m) => m.Loader);';

    expect(await rulesInPage(code)).toContain("no-restricted-syntax");
  });

  it("leaves loading a page at run time alone", async () => {
    expect(await rulesInPage('export const x = import("./Home");')).toEqual([]);
  });

  it("lets a story import story code by any path", async () => {
    const [result] = await eslint.lintText(
      'import { VariantRow } from "../../stories/variants";\nexport const x = VariantRow;\n',
      { filePath: "src/components/button/IconButton.stories.tsx" },
    );

    expect(
      result.messages.filter((m) => m.ruleId === "no-restricted-imports"),
    ).toEqual([]);
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
