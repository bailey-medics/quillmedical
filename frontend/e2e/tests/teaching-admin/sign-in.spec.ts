/**
 * The two people who run teaching sign in, and each lands where they
 * work.
 *
 * Items 1 and 2 of Phase 3 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. The login
 * form itself is checked in `login.spec.ts`; this is about what each of
 * them finds once they are in: a superuser reaches the operator's pages,
 * and a teaching admin reaches teaching and the part of admin that is
 * theirs, and not the operator's pages.
 */

import { test, expect } from "../../fixtures/axe";
import { PEOPLE, signIn } from "../../fixtures/signIn";

const NOT_FOUND = "404 - Page not found";

test.describe("Signing in", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  test("a superuser signs in and reaches the operator's pages", async ({
    page,
  }) => {
    await signIn(page, PEOPLE.superuser);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Administration", level: 1 }),
    ).toBeVisible();

    // Feedback is read by operators only.
    await page.goto("/admin/feedback");
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a teaching admin signs in and lands on teaching", async ({
    page,
    scanPage,
  }) => {
    await signIn(page, PEOPLE.teachingAdmin);

    await expect(page).toHaveURL(/\/teaching/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Admin opens for them, for the people and places that are theirs.
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Administration", level: 1 }),
    ).toBeVisible();
    await scanPage("teaching-admin-admin-home");

    // The operator's pages do not.
    await page.goto("/admin/feedback");
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  });
});
