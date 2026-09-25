/**
 * Whole-page accessibility scans for the end-to-end tests.
 *
 * Components are checked one by one in Storybook; this checks what they
 * compose into on a real page: one h1, landmarks, focus order and
 * contrast against real data. Same WCAG baseline as Storybook, from
 * `src/lib/accessibility/axeConfig.ts`.
 *
 * Usage: import `test` and `expect` from here instead of from
 * `@playwright/test`, then call `await scanPage("login")` after a
 * test's own assertions.
 */

import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { EXTRA_RULES, WCAG_TAGS } from "../../src/lib/accessibility/axeConfig";

/** Where Mantine remembers the colour scheme between visits. */
const COLOUR_SCHEME_KEY = "mantine-color-scheme-value";

/** One failing element: the rule and where. What the test asserts on. */
export interface AxeFingerprint {
  ruleId: string;
  selector: string;
}

/**
 * Run axe, once the page has stopped navigating. The app can reload
 * itself just after it loads (a new build's service worker taking over),
 * which destroys the page axe is reading; that is retried, twice.
 */
async function analyseSettled(page: Page) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await new AxeBuilder({ page })
        .options({
          runOnly: { type: "tag", values: [...WCAG_TAGS] },
          rules: Object.fromEntries(
            EXTRA_RULES.map((rule) => [rule.id, { enabled: rule.enabled }]),
          ),
        })
        .analyze();
    } catch (error) {
      const navigated = String(error).includes(
        "Execution context was destroyed",
      );
      if (!navigated || attempt >= 3) throw error;
      await page.waitForLoadState("networkidle");
    }
  }
}

/** Run axe on the page as it stands and report in both forms. */
async function scanOnce(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<AxeFingerprint[]> {
  // runOnly and rules in one options object: AxeBuilder.options()
  // replaces what withTags() set, so combining the two silently ran
  // axe's best-practice rules as well.
  const results = await analyseSettled(page);

  // The full report goes on the test, so a CI failure can be read from
  // the artefact without re-running anything.
  await testInfo.attach(`axe-${name}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  // And a short account in the log, so the cause is readable in the CI
  // output without downloading the attachment.
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      console.warn(
        `[axe ${name}] ${violation.id}: ${node.target.join(" ")}\n` +
          (node.failureSummary ?? ""),
      );
    }
  }

  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      ruleId: violation.id,
      selector: node.target.join(" "),
    })),
  );
}

/**
 * Switch the app's colour scheme and reload, so components that choose
 * colours in JavaScript render them too, not only the CSS variables.
 */
async function switchColourScheme(page: Page, scheme: "light" | "dark") {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    COLOUR_SCHEME_KEY,
    scheme,
  ] as const);
  await page.reload({ waitUntil: "networkidle" });
}

export const test = base.extend<{
  /** Scan the current page in light and dark, and fail on any violation. */
  scanPage: (name: string) => Promise<void>;
}>({
  scanPage: async ({ page }, provide, testInfo) => {
    await provide(async (name) => {
      const light = await scanOnce(page, testInfo, `${name}-light`);
      await switchColourScheme(page, "dark");
      const dark = await scanOnce(page, testInfo, `${name}-dark`);
      await switchColourScheme(page, "light");

      // Rule and selector pairs rather than the whole violations array,
      // so an unrelated markup change does not change what is compared.
      expect({ light, dark }).toEqual({ light: [], dark: [] });
    });
  },
});

export { expect };
