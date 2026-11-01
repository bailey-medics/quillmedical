/**
 * The passport admin's grants, a passport gone read-only, and the gates.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 17 to 21. Every change to a person is made by the passport
 * admin, as it would be in a trust, never by the operator.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { read, send } from "../../fixtures/api";
import {
  asPassportAdmin,
  makeAssessor,
  makeHolder,
} from "../../fixtures/passport";
import { PEOPLE, signIn } from "../../fixtures/signIn";

/** A competency with no levels and no scopes. */
const REFER_PALLIATIVE = {
  id: "ghnft_radiotherapy_record_refer_palliative",
  name: "Refer patients for palliative radiotherapy unsupervised",
};

/** How the catalogue names `passport_write` in a picker. */
const PASSPORT_WRITE = "Hold and Write a Clinician Passport";

/** Change somebody as the passport admin, through the API. */
async function changeAsPassportAdmin(
  browser: Browser,
  userId: number,
  change: Record<string, unknown>,
): Promise<number> {
  const page = await asPassportAdmin(browser);
  const response = await send(page, "PATCH", `/users/${userId}`, change);
  const status = response.status();
  await page.context().close();

  return status;
}

/** Add a logbook entry through the API, as the page's user. */
async function addEntry(page: Page, passportId: string | null) {
  return send(
    page,
    "POST",
    `/passport/${passportId}/logbook/${REFER_PALLIATIVE.id}`,
    { performed_on: "2026-10-01" },
  );
}

test.describe("Running the passport, and a read-only passport", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("17. a passport admin gives passport_write to a member of their place", async ({
    page,
    browser,
  }, testInfo) => {
    // Somebody at the passport site who may not yet write: they cannot
    // make a passport.
    const member = await makeAssessor(browser, testInfo.project.name);
    await signIn(page, member.username);
    const refused = await send(page, "POST", "/passport", {
      frameworks: ["clinical"],
    });
    expect(refused.status()).toBe(403);

    // The passport admin grants it on the member's edit page.
    const admin = await asPassportAdmin(browser);
    await admin.goto(`/admin/users/${member.id}/edit`);
    const next = admin.getByRole("button", { name: "Next", exact: true });
    const held = admin.getByRole("combobox", {
      name: "Held beyond the profession",
    });
    while (!(await held.isVisible())) {
      await next.click();
    }
    await held.click();
    await admin.getByRole("option", { name: PASSPORT_WRITE }).click();
    await admin.keyboard.press("Escape");
    const save = admin.getByRole("button", { name: "Update user" });
    while (!(await save.isVisible())) {
      await next.click();
    }
    await save.click();
    await expect(admin.getByText("User updated")).toBeVisible();
    await admin.context().close();

    // Now they can.
    const made = await send(page, "POST", "/passport", {
      frameworks: ["clinical"],
    });
    expect(made.status(), await made.text()).toBe(201);
  });

  test("18. a passport admin cannot give passport_write outside their places", async ({
    browser,
  }) => {
    // The seeded teaching admin works at "CI Teaching Hospital", where
    // this passport admin runs nothing. Their id is read as the
    // operator, which is a lookup, not setting anything up.
    const operator = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const lookup = await operator.newPage();
    await signIn(lookup, PEOPLE.superuser);
    const listed = await read<{ users: { id: number; username: string }[] }>(
      lookup,
      `/users?search=${PEOPLE.teachingAdmin}`,
    );
    const outsider = listed.users.find(
      (user) => user.username === PEOPLE.teachingAdmin,
    );
    expect(outsider).toBeDefined();
    await operator.close();

    const status = await changeAsPassportAdmin(browser, outsider?.id ?? 0, {
      additional_competencies: ["passport_write"],
    });
    expect([403, 404]).toContain(status);

    // And they are not on the passport admin's list to choose.
    const admin = await asPassportAdmin(browser);
    await admin.goto("/admin/users");
    await expect(admin.getByText(PEOPLE.teachingAdmin)).toHaveCount(0);
    await admin.context().close();
  });

  test("19. a holder whose writing is withdrawn is warned, and can still read and download", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    expect(
      await changeAsPassportAdmin(browser, holder.id, {
        removed_competencies: ["passport_write"],
      }),
    ).toBe(200);

    await signIn(page, holder.username);
    await page.goto("/passport");
    await expect(page.getByText("Your passport is read-only")).toBeVisible();

    await page.goto(`/passport/competencies/${REFER_PALLIATIVE.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: REFER_PALLIATIVE.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add an entry" }),
    ).toHaveCount(0);
    expect((await addEntry(page, holder.passportId)).status()).toBe(403);

    await page.goto("/passport/download");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("20. a read-only holder can still change their home page view", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    await changeAsPassportAdmin(browser, holder.id, {
      removed_competencies: ["passport_write"],
    });

    await signIn(page, holder.username);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "By record" }).check();
    await expect
      .poll(async () => {
        const me = await read<{ passport: { landing_view: string } }>(
          page,
          "/passport/me",
        );
        return me.passport.landing_view;
      })
      .toBe("by_record");
  });

  test("21. a holder taken off every passport place can still open their passport", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    expect(
      await changeAsPassportAdmin(browser, holder.id, { org_unit_ids: [] }),
    ).toBe(200);

    await signIn(page, holder.username);
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { level: 1, name: "My passport" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("competency-framework-table").first(),
    ).toBeVisible();
    await page.goto(`/passport/competencies/${REFER_PALLIATIVE.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: REFER_PALLIATIVE.name }),
    ).toBeVisible();

    // Writing stays behind the feature gate.
    expect((await addEntry(page, holder.passportId)).status()).toBe(403);
  });
});
