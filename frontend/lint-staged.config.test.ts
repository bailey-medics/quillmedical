import config from "./lint-staged.config";

type FileTask = (files: readonly string[]) => unknown;

/** A task lint-staged calls with the staged file names. */
function isFileTask(task: unknown): task is FileTask {
  return typeof task === "function";
}

/** The tasks for staged TypeScript, as the hook runs them. */
function typeScriptTasks(): unknown[] {
  if (typeof config === "function") {
    throw new Error("Expected a map of patterns to tasks");
  }

  const tasks = config["*.{ts,tsx,js,jsx}"];

  if (!Array.isArray(tasks)) {
    throw new Error("Expected a list of tasks for TypeScript files");
  }

  return tasks;
}

describe("lint-staged config", () => {
  it("type checks the whole app, not only the staged files", () => {
    const last = typeScriptTasks().at(-1);

    if (!isFileTask(last)) {
      throw new Error("Expected the type check to be a function");
    }

    // Handed file names, tsc ignores tsconfig, so the task must drop them.
    expect(last(["src/a.ts", "src/b.tsx"])).toBe("yarn typecheck");
  });

  it("type checks after ESLint and Prettier have rewritten the files", () => {
    expect(typeScriptTasks().slice(0, 2)).toEqual([
      "eslint --fix --max-warnings=0",
      "prettier --write",
    ]);
  });
});
