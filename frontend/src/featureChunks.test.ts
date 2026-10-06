import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import * as featureChunks from "./featureChunks";
import { FEATURE_CHUNKS } from "./featureChunks";
import type { User } from "./auth/AuthContext";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";

// The routes live in routes.tsx. main.tsx is read with it, because a
// page imported there would be bundled into first load just the same.
const routesSource = ["routes.tsx", "main.tsx"]
  .map((file) => fs.readFileSync(path.join(__dirname, file), "utf8"))
  .join("\n");

/** The module each `export … from "…"` line of a chunk re-exports. */
function reExportedModules(chunkFile: string): string[] {
  const source = fs.readFileSync(path.join(__dirname, chunkFile), "utf8");
  return [...source.matchAll(/^export .* from "(.+)";$/gm)].map((match) =>
    path.join(path.dirname(chunkFile), match[1] ?? ""),
  );
}

const CHUNKS = [
  { name: "admin", loader: "loadAdmin", file: "pages/admin/adminChunk.ts" },
  {
    name: "clinical",
    loader: "loadClinical",
    file: "pages/clinical/clinicalChunk.ts",
  },
  { name: "guides", loader: "loadGuides", file: "pages/guides/guidesChunk.ts" },
  {
    name: "passport",
    loader: "loadPassport",
    file: "pages/passport/passportChunk.ts",
  },
  { name: "safety", loader: "loadSafety", file: "pages/safety/safetyChunk.ts" },
  {
    name: "teaching",
    loader: "loadTeaching",
    file: "features/teaching/teachingChunk.ts",
  },
] as const;

// The rule the plan sets: a feature is one lazy chunk, never one per page.
// A bare `import()` in a route is a per-page chunk.
it("gives no route in routes.tsx a lazy import of its own", () => {
  expect(routesSource).not.toMatch(/lazy:\s*\(\)\s*=>\s*import\(/);
});

describe.each(CHUNKS)("the $name chunk", ({ loader, file }) => {
  it("exports nothing but page components", async () => {
    const chunk: Record<string, unknown> = await featureChunks[loader]();

    expect(Object.keys(chunk).length).toBeGreaterThan(0);
    for (const [name, page] of Object.entries(chunk)) {
      expect(page, name).toBeTypeOf("function");
    }
  });

  // A page routes.tsx also imports statically is bundled into first load,
  // and its `lazy` then defers nothing. The build says so only in a
  // warning nobody reads.
  it("holds no page that routes.tsx still imports statically", () => {
    const stillStatic = reExportedModules(file).filter((module) =>
      routesSource.includes(`from "./${module}"`),
    );

    expect(stillStatic).toEqual([]);
  });

  it("is loaded by routes.tsx only through its loader", () => {
    expect(routesSource).toContain(`lazyFrom(${loader}, `);
    const module = `"./${file.replace(/\.ts$/, "")}"`;
    expect(routesSource).not.toContain(`from ${module}`);
    expect(routesSource).not.toContain(`import(${module})`);
  });
});

// Losing an exam attempt is the one failure here that cannot be put right
// afterwards. The attempt and its result cannot safely reload, so the
// result page must already be in memory when the exam starts: both pages
// in the one teaching chunk, and neither route loading anything else.
describe("the exam", () => {
  it("has the attempt and its result in the same chunk", async () => {
    const chunk = await featureChunks.loadTeaching();

    expect(chunk.AssessmentAttempt).toBeTypeOf("function");
    expect(chunk.AssessmentResultPage).toBeTypeOf("function");
  });

  it.each([
    ["assessment/:id", "AssessmentAttempt"],
    ["assessment/:id/result", "AssessmentResultPage"],
  ])("loads %s from the teaching chunk", (routePath, page) => {
    // The page named may be followed by a guard, `lazyFrom`'s third
    // argument: the attempt sits behind the competency that opens
    // modules. What matters here is the loader and the page.
    const route = new RegExp(
      `path: "${routePath}",\\s*lazy: lazyFrom\\(loadTeaching, "${page}"[,)]`,
    );

    expect(routesSource).toMatch(route);
  });
});

describe("who may open each feature", () => {
  const nobody = { enabled_features: [], competencies: [] } as unknown as User;

  function canOpen(name: string, user: Partial<User>): boolean {
    const chunk = FEATURE_CHUNKS.find((candidate) => candidate.name === name);
    if (chunk === undefined) throw new Error(`no chunk called ${name}`);
    return chunk.canOpen({ ...nobody, ...user } as User);
  }

  // The background fetch finds a feature's files by its chunk module's
  // path. A loader with no entry would be routed and never fetched early;
  // an entry naming the wrong path would fetch nothing, in silence.
  it("names, for every loader, the module that loader imports", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "featureChunks.ts"),
      "utf8",
    );
    const imported = [...source.matchAll(/import\("\.\/(.+Chunk)"\)/g)].map(
      (match) => `src/${match[1]}.ts`,
    );

    expect(imported.length).toBe(
      Object.keys(featureChunks).filter((name) => name.startsWith("load"))
        .length,
    );
    expect(FEATURE_CHUNKS.map((chunk) => chunk.source).sort()).toEqual(
      imported.sort(),
    );
    for (const chunk of FEATURE_CHUNKS) {
      expect(
        fs.existsSync(path.join(__dirname, "..", chunk.source)),
        chunk.source,
      ).toBe(true);
    }
  });

  it("lets nobody with nothing open anything", () => {
    expect(FEATURE_CHUNKS.filter((chunk) => chunk.canOpen(nobody))).toEqual([]);
  });

  it("opens teaching on the feature alone", () => {
    expect(canOpen("teaching", { enabled_features: ["teaching"] })).toBe(true);
  });

  it("opens passport on the feature and the competency together", () => {
    const competencies = ["assess_clinician_passport"] as User["competencies"];

    expect(canOpen("passport", { enabled_features: ["passport"] })).toBe(false);
    expect(canOpen("passport", { competencies })).toBe(false);
    expect(
      canOpen("passport", { enabled_features: ["passport"], competencies }),
    ).toBe(true);
  });

  it("opens passport for a holder the feature does not reach", () => {
    const competencies = ["assess_clinician_passport"] as User["competencies"];

    expect(canOpen("passport", { owns_passport: true, competencies })).toBe(
      true,
    );
  });

  it("opens admin for manage_users and for every scoped manager", () => {
    for (const competency of ["manage_users", ...SCOPED_MANAGER_IDS]) {
      const competencies = [competency] as User["competencies"];
      expect(canOpen("admin", { competencies }), competency).toBe(true);
    }
  });

  it("opens safety on the feature and the competency together", () => {
    const competencies = ["view_safety_cases"] as User["competencies"];

    expect(canOpen("safety", { enabled_features: ["safety"] })).toBe(false);
    expect(canOpen("safety", { competencies })).toBe(false);
    expect(
      canOpen("safety", { enabled_features: ["safety"], competencies }),
    ).toBe(true);
  });

  it("opens clinical only when the flag says so, never when it is unset", () => {
    expect(canOpen("clinical", { clinical_services_enabled: true })).toBe(true);
    expect(canOpen("clinical", { clinical_services_enabled: false })).toBe(
      false,
    );
    expect(canOpen("clinical", {})).toBe(false);
  });

  // Each test above restates a guard. This ties them to routes.tsx, so a
  // guard changed there without the list being changed fails here.
  it.each([
    'feature="teaching"',
    'competency="assess_clinician_passport"',
    'competency={["manage_users", ...SCOPED_MANAGER_IDS]}',
    'feature="safety"',
    'competency="view_safety_cases"',
    "<RequireClinical>",
    "<RequirePassport>",
  ])("mirrors a guard routes.tsx still has: %s", (guard) => {
    expect(routesSource.replace(/\s+/g, " ")).toContain(guard);
  });
});

// `handle.safeForReload` lets the app reload a page silently: for an
// update, or to recover a chunk it could not fetch. A page holding work
// that has not been saved must not carry it.
describe("pages holding unsaved work", () => {
  it.each(["organisations/:id/members/:userId", "sites/:id/members/:userId"])(
    "does not mark %s safe to reload, since its switches wait for Save changes",
    (routePath) => {
      const start = routesSource.indexOf(`path: "${routePath}"`);
      const nextRoute = routesSource.indexOf("path: ", start + 1);

      expect(start).toBeGreaterThan(-1);
      expect(routesSource.slice(start, nextRoute)).not.toContain(
        "safeForReload",
      );
    },
  );
});
