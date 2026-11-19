/**
 * Reads the a11y addon's report for one render of a story.
 *
 * No report is not a clean scan. If axe crashed, or the addon sent
 * nothing, the story was never checked, and passing it would hide that.
 * Kept apart from `a11y-dark-mode.ts` so it can be tested without a
 * browser.
 */

/** One axe violation, trimmed to what the report needs. */
export interface DarkViolation {
  id: string;
  help: string;
  targets: string[];
}

/** What one render's a11y report says. */
export type A11yReading =
  | { kind: "checked"; violations: DarkViolation[] }
  | { kind: "no-report" }
  | { kind: "axe-error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readViolation(value: unknown): DarkViolation | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const targets = nodes.map((node) =>
    isRecord(node) && Array.isArray(node.target)
      ? node.target.map(String).join(" ")
      : "",
  );

  return {
    id: value.id,
    help: typeof value.help === "string" ? value.help : "",
    targets,
  };
}

/**
 * Classify the reporters Storybook sends with `STORY_FINISHED`. Only a
 * report with a real list of violations counts as checked.
 */
export function readA11yReport(reporters: unknown): A11yReading {
  if (!Array.isArray(reporters)) return { kind: "no-report" };

  const report: unknown = reporters.find(
    (r) => isRecord(r) && r.type === "a11y",
  );
  if (!isRecord(report) || !isRecord(report.result)) {
    return { kind: "no-report" };
  }

  const { result } = report;
  if ("error" in result && result.error) return { kind: "axe-error" };
  if (!Array.isArray(result.violations)) return { kind: "axe-error" };

  const violations: DarkViolation[] = [];
  for (const raw of result.violations) {
    const violation = readViolation(raw);
    if (!violation) return { kind: "axe-error" };
    violations.push(violation);
  }

  return { kind: "checked", violations };
}
