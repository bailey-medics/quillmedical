/**
 * A user manager opens one member of their organisation, grants them a
 * competency and authorises it there in one step, then switches practice
 * off and on again.
 *
 * Signs in as `usermanager`, seeded by `backend/scripts/seed_ci.py`. Each
 * browser project works on its own member (`practice_chromium`,
 * `practice_webkit`), so the two never change the same person. The grant
 * step is skipped when a retry finds it already done, and the switch ends
 * where it started, so a retry replays cleanly.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/axe";

const COMPETENCY = "Certify Death";

async function signInAsUserManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("usermanager");
  await page.getByRole("textbox", { name: "Password" }).fill("usermanager123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.describe("Member practice", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  test("grant a competency, then switch practice off and on", async ({
    page,
    scanPage,
  }, testInfo) => {
    const member = `practice_${testInfo.project.name}`;

    await signInAsUserManager(page);
    await page.goto("/admin/organisations");
    await page.getByText("CI Teaching Hospital").click();
    await expect(
      page.getByRole("heading", { name: "CI Teaching Hospital", level: 1 }),
    ).toBeVisible();

    // The staff table carries the new count, and a row opens the member.
    await expect(
      page.getByRole("columnheader", { name: "Authorised here" }),
    ).toBeVisible();
    // Seeded without a full name, so the name column falls back to the
    // username and the member appears in two cells of the same row.
    await page.getByRole("row", { name: new RegExp(member) }).click();
    await expect(page).toHaveURL(/\/admin\/organisations\/\d+\/members\/\d+$/);

    await expect(
      page.getByRole("heading", { name: "Competencies held" }),
    ).toBeVisible();
    const toggle = page.getByRole("switch", {
      name: `${COMPETENCY}: may practise here`,
    });

    // Grant it from the other competencies, unless a retry already did.
    // "Other competencies" is the last table on the page, so its search
    // is the last one; the catalogue is long enough to page.
    if (!(await toggle.isVisible())) {
      await page.getByRole("button", { name: "Open search" }).last().click();
      await page.getByRole("textbox", { name: "Search" }).fill(COMPETENCY);
      await page
        .getByRole("row", { name: new RegExp(COMPETENCY) })
        .getByRole("button", { name: "Grant and authorise" })
        .click();
      // Both confirm modals stay mounted, so pick this one by its text.
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "applies everywhere they work" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Grant and authorise" }).click();
      await expect(page.getByText("Granted and authorised")).toBeVisible();
    }

    await expect(toggle).toBeChecked();

    // The switch's input is visually hidden, so click its track, the
    // label a person clicks.
    const track = page.locator(
      `label[for="${await toggle.getAttribute("id")}"]`,
    );

    // Off asks first, because withdrawal has no undo.
    await track.click();
    await page
      .getByRole("dialog")
      .filter({ hasText: "stay qualified" })
      .getByRole("button", { name: "Withdraw" })
      .click();
    await expect(toggle).not.toBeChecked();

    // On acts at once, leaving the member as the test found them.
    await track.click();
    await expect(toggle).toBeChecked();

    await scanPage("member-practice");
  });
});
