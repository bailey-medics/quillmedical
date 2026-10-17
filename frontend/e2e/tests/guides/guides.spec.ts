/**
 * The guides a teaching admin and a teaching delegate are shown.
 *
 * Phase 7 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The list at `/guides` groups guides by who they are for: a TA sees "For
 * admins" and "For everyone", and a TD "For everyone" alone. The TA is
 * `educator`, whom every browser project starts signed in as; the TD is
 * made for the test.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { makePerson } from "../../fixtures/people";
import { signIn } from "../../fixtures/signIn";

const FOR_ADMINS = ["Add a delegate by hand", "See delegates' results"];
const FOR_EVERYONE = ["Join a course", "Take a module and its assessment"];
const NOT_FOUND = "404 - Page not found";

/**
 * The headings of the guides list, in order: each group's heading, then
 * the title of each guide in it.
 */
async function listed(page: Page): Promise<string[]> {
  const headings = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(headings.first()).toBeVisible();

  return headings.allInnerTexts();
}

/** A guide's card in the list, found by its title. */
function cardOf(page: Page, title: string) {
  return page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .filter({ has: page.getByRole("link", { name: "Read guide" }) })
    .last();
}

/** Open a guide from the list, and check it is the guide asked for. */
async function openGuide(page: Page, title: string): Promise<void> {
  await page.goto("/guides");
  await cardOf(page, title).getByRole("link", { name: "Read guide" }).click();
  await expect(page).toHaveURL(/\/guides\/[a-z-]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

test.describe("Guides, as a TA", () => {
  test("sees the guides for admins and for everyone", async ({
    page,
    scanPage,
  }) => {
    await page.goto("/guides");

    // Each group's heading, then its guides, admins' first.
    expect(await listed(page)).toEqual([
      "For admins",
      ...FOR_ADMINS,
      "For everyone",
      ...FOR_EVERYONE,
    ]);

    await scanPage("guides-for-a-teaching-admin");
  });

  for (const title of [...FOR_ADMINS, ...FOR_EVERYONE]) {
    test(`opens ${title}`, async ({ page }) => {
      await openGuide(page, title);
    });
  }
});

test.describe("Guides, as a TD", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  test("sees only the guides for everyone, and opens each", async ({
    page,
    browser,
  }, testInfo) => {
    const username = await makePerson(
      browser,
      "guides_td",
      testInfo.project.name,
      "teaching_delegate",
    );

    await signIn(page, username);
    await page.goto("/guides");
    // One group, so its heading is left out, and only its guides.
    expect(await listed(page)).toEqual(FOR_EVERYONE);

    for (const title of FOR_EVERYONE) {
      await openGuide(page, title);
    }

    // An admin guide's address, typed in, is not theirs either.
    await page.goto("/guides/add-a-delegate-by-hand");
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  });
});
