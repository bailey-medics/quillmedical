/**
 * A teaching manager is shown a 404 for the admin pages that are not
 * theirs.
 *
 * `educator`, seeded by backend/scripts/seed_ci.py, is a `teaching_admin`:
 * the profession carries `manage_teaching`, which opens the admin area,
 * and not `manage_users`, which most of it needs. All of admin is one lazy
 * chunk, so this user downloads the code for pages they may not open. The
 * guards are what keep them out, and a guard now renders after that chunk
 * has loaded. So the refusal is checked here in a real browser, for each
 * of the three ways a route in `routes.tsx` carries its guard.
 */

import { expect, test } from "@playwright/test";

const NOT_FOUND = "404 - Page not found";

test.describe("A teaching manager in the admin area", () => {
  test("opens the admin home, so a 404 below is the guard at work", async ({
    page,
  }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Administration" }),
    ).toBeVisible();
  });

  const forbidden = [
    {
      why: "a guard route around several pages, needing manage_users",
      address: "/admin/patients",
    },
    {
      why: "a guard passed to lazyFrom, needing manage_users",
      address: "/admin/organisations/1/edit",
    },
    {
      why: "an operator-only page",
      address: "/admin/feedback",
    },
  ];

  for (const { why, address } of forbidden) {
    test(`is shown a 404 at ${address}: ${why}`, async ({ page }) => {
      await page.goto(address);

      await expect(
        page.getByRole("heading", { name: NOT_FOUND }),
      ).toBeVisible();
      // A 404, not the app's error page: the chunk loaded and the guard
      // refused, which is different from the page failing.
      await expect(page.getByTestId("error-boundary-fallback")).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${address}$`));
    });
  }
});
