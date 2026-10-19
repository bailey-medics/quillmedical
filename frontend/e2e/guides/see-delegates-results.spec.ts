/**
 * Screenshots for the guide "See delegates' results".
 *
 * Taken as the seeded teaching admin, of the delegates and attempts that
 * `backend/scripts/seed_guides.py` makes up.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

/** The request that lists the modules the page offers. */
const MODULES = "**/api/teaching/admin/delegates/modules";

/** A made-up module, so the Module drop down has two to show. */
const SECOND_MODULE = {
  bank_id: "colonoscopy-assessment",
  title: "Colonoscopy assessment",
};

test("see delegates' results", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/teaching");
  await expect(
    page.getByRole("heading", { level: 1, name: "Teaching" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View delegates" }),
  ).toBeVisible();
  await shot(page, "see-delegates-results/teaching-admin");

  // The Module drop down shows only where an organisation runs more than
  // one module, and the guides' stack runs one. A second is added to the
  // list the page is given, for the pictures only: it is never chosen,
  // since the API has no delegates for a module that does not exist.
  await page.route(MODULES, async (route) => {
    const response = await route.fetch();
    const modules = (await response.json()) as unknown[];
    await route.fulfill({ response, json: [...modules, SECOND_MODULE] });
  });

  await page.getByRole("link", { name: "View delegates" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "All delegates" }),
  ).toBeVisible();
  await expect(page.getByText("Total delegates")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Aisha Rahman" })).toBeVisible();
  await shot(page, "see-delegates-results/all-delegates");

  const module = page.getByRole("combobox", { name: "Module" });
  await module.click();
  await expect(
    page.getByRole("option", { name: SECOND_MODULE.title }),
  ).toBeVisible();
  await shot(page, "see-delegates-results/module");
  // Closed with nothing chosen.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("option", { name: SECOND_MODULE.title }),
  ).toBeHidden();
  await page.unroute(MODULES);

  await page.getByRole("button", { name: "Filter delegates" }).click();
  // The filter's groups open folded, so there is no one line of it to
  // wait for by name. Its opening is a short animation.
  await page.waitForTimeout(600);
  // Open the list inside it, so the picture shows what can be chosen.
  await page.getByPlaceholder(/Select items/).click();
  await page.waitForTimeout(400);
  await shot(page, "see-delegates-results/filter");
});
