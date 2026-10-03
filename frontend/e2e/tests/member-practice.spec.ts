/**
 * A user manager opens one member of their organisation, grants them a
 * competency and authorises it there in one step, then switches practice
 * off and on again, saving and confirming each change.
 *
 * Signs in as `usermanager`, seeded by `backend/scripts/seed_ci.py`. Each
 * browser project works on its own member (`practice_chromium`,
 * `practice_webkit`), so the two never change the same person. The grant
 * step is skipped when a retry finds it already done, a switch a retry
 * finds off is put back on first, and the switch ends where it started,
 * so a retry replays cleanly.
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
      page.getByRole("columnheader", { name: "May practise here" }),
    ).toBeVisible();
    const toggle = page.getByRole("switch", {
      name: `${COMPETENCY}: may practise here`,
    });

    // Grant it through the modal, unless a retry already did.
    if (!(await toggle.isVisible())) {
      await page.getByRole("button", { name: "Grant competency" }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "everywhere they work" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("combobox").fill(COMPETENCY);
      await page.getByRole("option", { name: COMPETENCY }).click();
      await dialog.getByRole("button", { name: "Grant and authorise" }).click();
      await expect(dialog).toBeHidden();
    }

    // The switch's input is visually hidden, so click its track, the
    // label a person clicks.
    const track = page.locator(
      `label[for="${await toggle.getAttribute("id")}"]`,
    );

    /**
     * Save the switches: nothing reaches the server until "Save changes"
     * is pressed and the list of changes is confirmed.
     */
    async function saveAndConfirm(warning: string | null, outcome: string) {
      await page.getByRole("button", { name: "Save changes" }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "Confirm practice changes" });
      await expect(dialog).toBeVisible();
      if (warning) await expect(dialog).toContainText(warning);
      await dialog.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(outcome)).toBeVisible();
    }

    // A retry can find the switch off, if the run before it stopped
    // between the two saves. Put it back on first.
    if (!(await toggle.isChecked())) {
      await track.click();
      await saveAndConfirm(null, `${COMPETENCY} authorised`);
    }
    await expect(toggle).toBeChecked();

    // Off: the switch moves at once, and saving warns that withdrawing
    // takes effect straight away.
    await track.click();
    await expect(toggle).not.toBeChecked();
    await saveAndConfirm("stay qualified", `${COMPETENCY} withdrawn`);
    await expect(toggle).not.toBeChecked();

    // On again, leaving the member as the test found them.
    await track.click();
    await saveAndConfirm(null, `${COMPETENCY} authorised`);
    await expect(toggle).toBeChecked();

    await scanPage("member-practice");
  });
});
