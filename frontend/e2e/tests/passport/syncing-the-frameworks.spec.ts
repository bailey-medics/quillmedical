/**
 * An operator starts the framework sync from the passport admin page.
 *
 * `/admin/passport` has one button, which starts the framework sync job.
 * The end-to-end stack has no Cloud Run job, so pressing it is refused,
 * in the server's words, and that refusal is what is read here: it shows
 * the page reached the API and said what came back. Somebody who does
 * not operate Quill is shown a 404. See Phase 14 of
 * docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
 */

import { expect, test } from "@playwright/test";
import { PEOPLE, signIn } from "../../fixtures/signIn";

test.describe("Syncing the frameworks by hand", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an operator presses the button and is told no job is set up here", async ({
    page,
  }) => {
    await signIn(page, PEOPLE.operator);
    await page.goto("/admin/passport");

    await expect(
      page.getByRole("heading", { level: 1, name: "Passport" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Last sync" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /sync frameworks/i }).click();

    await expect(
      page.getByText("The framework sync is not set up here."),
    ).toBeVisible();
  });

  test("somebody who does not operate Quill is shown a 404", async ({
    page,
  }) => {
    await signIn(page, PEOPLE.teachingAdmin);
    await page.goto("/admin/passport");

    await expect(page.getByText("404 - Page not found")).toBeVisible();
  });
});
